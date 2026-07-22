import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { prisma } from "../../config/prisma";
import { env } from "../../config/env";
import { AppError } from "../../utils/AppError";
import { AccessTokenPayload } from "../../middleware/auth";
import { registerSchema } from "./auth.schemas";
import { z } from "zod";

type RegisterInput = z.infer<typeof registerSchema>;

function signAccessToken(payload: AccessTokenPayload) {
  const options: jwt.SignOptions = { expiresIn: env.jwt.accessExpiresIn as jwt.SignOptions["expiresIn"] };
  return jwt.sign(payload, env.jwt.accessSecret, options);
}

function signRefreshToken(userId: string) {
  const options: jwt.SignOptions = { expiresIn: env.jwt.refreshExpiresIn as jwt.SignOptions["expiresIn"] };
  return jwt.sign({ sub: userId }, env.jwt.refreshSecret, options);
}

function signResetToken(userId: string) {
  const options: jwt.SignOptions = { expiresIn: env.jwt.resetExpiresIn as jwt.SignOptions["expiresIn"] };
  return jwt.sign({ sub: userId, purpose: "password_reset" }, env.jwt.resetSecret, options);
}

async function issueTokens(userId: string, role: AccessTokenPayload["role"]) {
  const accessToken = signAccessToken({ sub: userId, role });
  const refreshToken = signRefreshToken(userId);
  const refreshTokenHash = await bcrypt.hash(refreshToken, 10);

  await prisma.user.update({
    where: { id: userId },
    data: { refreshTokenHash },
  });

  return { accessToken, refreshToken };
}

export async function register(input: RegisterInput) {
  const existing = await prisma.user.findUnique({ where: { email: input.email } });
  if (existing) {
    throw new AppError(409, "An account with this email already exists");
  }

  const passwordHash = await bcrypt.hash(input.password, 10);

  const user = await prisma.$transaction(async (tx) => {
    const created = await tx.user.create({
      data: {
        email: input.email,
        passwordHash,
        role: input.role,
      },
    });

    if (input.role === "CUSTOMER") {
      await tx.customerProfile.create({
        data: {
          userId: created.id,
          firstName: input.firstName ?? "",
          lastName: input.lastName ?? "",
        },
      });
    } else {
      await tx.providerProfile.create({
        data: {
          userId: created.id,
          providerType: input.providerType ?? "INDIVIDUAL",
          displayName: input.displayName ?? input.email,
        },
      });
    }

    return created;
  });

  const tokens = await issueTokens(user.id, user.role);
  return { user, ...tokens };
}

export async function login(email: string, password: string) {
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user || !user.passwordHash || user.deletedAt) {
    throw new AppError(401, "Invalid email or password");
  }

  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) {
    throw new AppError(401, "Invalid email or password");
  }

  const tokens = await issueTokens(user.id, user.role);
  return { user, ...tokens };
}

export async function refresh(refreshToken: string) {
  let decoded: { sub: string };
  try {
    decoded = jwt.verify(refreshToken, env.jwt.refreshSecret) as { sub: string };
  } catch {
    throw new AppError(401, "Invalid or expired refresh token");
  }

  const user = await prisma.user.findUnique({ where: { id: decoded.sub } });
  if (!user?.refreshTokenHash) {
    throw new AppError(401, "Refresh token has been revoked");
  }

  const matches = await bcrypt.compare(refreshToken, user.refreshTokenHash);
  if (!matches) {
    throw new AppError(401, "Refresh token has been revoked");
  }

  const tokens = await issueTokens(user.id, user.role);
  return tokens;
}

export async function logout(userId: string) {
  await prisma.user.update({
    where: { id: userId },
    data: { refreshTokenHash: null },
  });
}

export async function requestPasswordReset(email: string) {
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) {
    // Don't reveal whether the email is registered.
    return;
  }

  const resetToken = signResetToken(user.id);
  const decoded = jwt.decode(resetToken) as { exp: number };
  const passwordResetTokenHash = await bcrypt.hash(resetToken, 10);

  await prisma.user.update({
    where: { id: user.id },
    data: {
      passwordResetTokenHash,
      passwordResetExpiresAt: new Date(decoded.exp * 1000),
    },
  });

  // No email provider is wired up yet (FR28) — log the link so it can be tested locally.
  console.log(`Password reset requested for ${email}: token=${resetToken}`);
}

export async function resetPassword(token: string, newPassword: string) {
  let decoded: { sub: string; purpose: string };
  try {
    decoded = jwt.verify(token, env.jwt.resetSecret) as { sub: string; purpose: string };
  } catch {
    throw new AppError(400, "Invalid or expired reset token");
  }

  if (decoded.purpose !== "password_reset") {
    throw new AppError(400, "Invalid or expired reset token");
  }

  const user = await prisma.user.findUnique({ where: { id: decoded.sub } });
  if (!user?.passwordResetTokenHash || !user.passwordResetExpiresAt || user.passwordResetExpiresAt < new Date()) {
    throw new AppError(400, "Invalid or expired reset token");
  }

  const matches = await bcrypt.compare(token, user.passwordResetTokenHash);
  if (!matches) {
    throw new AppError(400, "Invalid or expired reset token");
  }

  const passwordHash = await bcrypt.hash(newPassword, 10);

  await prisma.user.update({
    where: { id: user.id },
    data: {
      passwordHash,
      passwordResetTokenHash: null,
      passwordResetExpiresAt: null,
      refreshTokenHash: null, // force re-login on all devices after a password reset
    },
  });
}
