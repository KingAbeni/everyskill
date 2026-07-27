import { z } from "zod";

export const updateProviderProfileSchema = z.object({
  displayName: z.string().min(1).optional(),
  firstName: z.string().min(1).optional(),
  lastName: z.string().min(1).optional(),
  profileImage: z.string().url().optional(),
  coverImage: z.string().url().optional(),
  description: z.string().min(1).optional(),
  skills: z.array(z.string().min(1)).optional(),
  yearsExperience: z.number().int().min(0).optional(),
  contactInfo: z.string().min(1).optional(),
  serviceArea: z.string().min(1).optional(),
  latitude: z.number().min(-90).max(90).optional(),
  longitude: z.number().min(-180).max(180).optional(),
  website: z.string().url().optional(),
  directorFirstName: z.string().min(1).optional(),
  directorLastName: z.string().min(1).optional(),
  directorContactInfo: z.string().min(1).optional(),
  socialLinks: z.record(z.string(), z.unknown()).optional(),
  portfolioLinks: z.record(z.string(), z.unknown()).optional(),
  languages: z.array(z.string().min(1)).optional(),
  galleryImages: z.array(z.string().url()).optional(),
  operatingHours: z.record(z.string(), z.unknown()).optional(),
});

export const createCertificationSchema = z.object({
  name: z.string().min(1),
  issuer: z.string().min(1).optional(),
  fileUrl: z.string().url(),
  verificationLink: z.string().url().optional(),
  expiryDate: z.coerce.date().optional(),
});

export const submitKycDocumentSchema = z.object({
  documentType: z.enum(["IDENTITY", "BUSINESS_REGISTRATION", "REPRESENTATIVE_IDENTITY"]),
  documentPath: z.string().min(1),
});
