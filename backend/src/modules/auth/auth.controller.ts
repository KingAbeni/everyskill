import { Request, Response } from "express";
import { forgotPasswordSchema, loginSchema, refreshSchema, registerSchema, resetPasswordSchema } from "./auth.schemas";
import * as authService from "./auth.service";

function sanitizeUser(user: { id: string; email: string; role: string; emailVerified: boolean }) {
  return { id: user.id, email: user.email, role: user.role, emailVerified: user.emailVerified };
}

export async function registerHandler(req: Request, res: Response) {
  const input = registerSchema.parse(req.body);
  const { user, accessToken, refreshToken } = await authService.register(input);
  res.status(201).json({ user: sanitizeUser(user), accessToken, refreshToken });
}

export async function loginHandler(req: Request, res: Response) {
  const { email, password } = loginSchema.parse(req.body);
  const { user, accessToken, refreshToken } = await authService.login(email, password);
  res.status(200).json({ user: sanitizeUser(user), accessToken, refreshToken });
}

export async function refreshHandler(req: Request, res: Response) {
  const { refreshToken } = refreshSchema.parse(req.body);
  const tokens = await authService.refresh(refreshToken);
  res.status(200).json(tokens);
}

export async function logoutHandler(req: Request, res: Response) {
  await authService.logout(req.user!.sub);
  res.status(204).send();
}

export async function forgotPasswordHandler(req: Request, res: Response) {
  const { email } = forgotPasswordSchema.parse(req.body);
  await authService.requestPasswordReset(email);
  res.status(200).json({ message: "If an account exists for this email, a password reset link has been sent." });
}

export async function resetPasswordHandler(req: Request, res: Response) {
  const { token, newPassword } = resetPasswordSchema.parse(req.body);
  await authService.resetPassword(token, newPassword);
  res.status(200).json({ message: "Password has been reset. Please log in again." });
}
