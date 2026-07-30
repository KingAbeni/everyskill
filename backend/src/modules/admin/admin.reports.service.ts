import { prisma } from "../../config/prisma";
import { z } from "zod";
import { plainRangeQuerySchema, rankingQuerySchema, timeSeriesQuerySchema } from "./admin.reports.schemas";
import { getPlatformSettings } from "../platform/platform.service";
import { getProviderRatingSummaries } from "../review/review.service";

type TimeSeriesQuery = z.infer<typeof timeSeriesQuerySchema>;
type RankingQuery = z.infer<typeof rankingQuerySchema>;
type PlainRangeQuery = z.infer<typeof plainRangeQuerySchema>;
type GroupBy = TimeSeriesQuery["groupBy"];

const REPORT_DEFAULT_WINDOW_DAYS = 30;

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function round4(n: number): number {
  return Math.round(n * 10000) / 10000;
}

function countBy<T>(rows: T[], keyFn: (row: T) => string): Record<string, number> {
  const result: Record<string, number> = {};
  for (const row of rows) {
    const key = keyFn(row);
    result[key] = (result[key] ?? 0) + 1;
  }
  return result;
}

function startOfIsoWeek(date: Date): Date {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const day = d.getUTCDay();
  const diff = (day === 0 ? -6 : 1) - day;
  d.setUTCDate(d.getUTCDate() + diff);
  return d;
}

function bucketKey(date: Date, groupBy: GroupBy): string {
  if (groupBy === "day") {
    return date.toISOString().slice(0, 10);
  }
  if (groupBy === "week") {
    return startOfIsoWeek(date).toISOString().slice(0, 10);
  }
  return date.toISOString().slice(0, 7);
}

function defaultRangeForGroupBy(groupBy: GroupBy): { start: Date; end: Date } {
  const end = new Date();
  const start = new Date(end);
  if (groupBy === "day") {
    start.setUTCDate(start.getUTCDate() - REPORT_DEFAULT_WINDOW_DAYS);
  } else if (groupBy === "week") {
    start.setUTCDate(start.getUTCDate() - 7 * 12);
  } else {
    start.setUTCMonth(start.getUTCMonth() - 12);
  }
  return { start, end };
}

function resolveTimeSeriesRange(query: TimeSeriesQuery): { start: Date; end: Date } {
  if (query.startDate && query.endDate) {
    return { start: query.startDate, end: query.endDate };
  }
  const defaults = defaultRangeForGroupBy(query.groupBy);
  return { start: query.startDate ?? defaults.start, end: query.endDate ?? defaults.end };
}

function resolvePlainRange(query: { startDate?: Date; endDate?: Date }): { start: Date; end: Date } {
  const end = query.endDate ?? new Date();
  const start = query.startDate ?? new Date(end.getTime() - REPORT_DEFAULT_WINDOW_DAYS * 24 * 60 * 60 * 1000);
  return { start, end };
}

/** Every bucket key between start/end (inclusive), so periods with zero rows still appear as 0. */
function generateBucketSeries(start: Date, end: Date, groupBy: GroupBy): string[] {
  const keys: string[] = [];
  const seen = new Set<string>();
  const cursor = new Date(start);
  while (cursor <= end) {
    const key = bucketKey(cursor, groupBy);
    if (!seen.has(key)) {
      keys.push(key);
      seen.add(key);
    }
    if (groupBy === "day") {
      cursor.setUTCDate(cursor.getUTCDate() + 1);
    } else if (groupBy === "week") {
      cursor.setUTCDate(cursor.getUTCDate() + 7);
    } else {
      cursor.setUTCMonth(cursor.getUTCMonth() + 1);
    }
  }
  return keys;
}

function bucketRows<T extends { createdAt: Date }>(rows: T[], groupBy: GroupBy): Map<string, T[]> {
  const map = new Map<string, T[]>();
  for (const row of rows) {
    const key = bucketKey(row.createdAt, groupBy);
    const arr = map.get(key);
    if (arr) {
      arr.push(row);
    } else {
      map.set(key, [row]);
    }
  }
  return map;
}

function buildTimeSeries<T extends { createdAt: Date }>(
  rows: T[],
  start: Date,
  end: Date,
  groupBy: GroupBy,
  summarize: (rowsInBucket: T[]) => Record<string, unknown>,
) {
  const periods = generateBucketSeries(start, end, groupBy);
  const buckets = bucketRows(rows, groupBy);
  return periods.map((period) => ({ period, ...summarize(buckets.get(period) ?? []) }));
}

// ---------- FR25 — Reports & Analytics ----------

export async function getUsersReport(query: TimeSeriesQuery) {
  const { start, end } = resolveTimeSeriesRange(query);
  const [users, totalsByRole] = await Promise.all([
    prisma.user.findMany({ where: { createdAt: { gte: start, lte: end } }, select: { createdAt: true, role: true } }),
    prisma.user.groupBy({ by: ["role"], _count: { role: true } }),
  ]);

  const newUsersByPeriod = buildTimeSeries(users, start, end, query.groupBy, (rows) => ({
    count: rows.length,
    byRole: countBy(rows, (r) => r.role),
  }));

  return {
    range: { start, end, groupBy: query.groupBy },
    newUsersByPeriod,
    totalsByRole: Object.fromEntries(totalsByRole.map((r) => [r.role, r._count.role])),
  };
}

export async function getProvidersReport(query: TimeSeriesQuery) {
  const { start, end } = resolveTimeSeriesRange(query);
  const [providers, totalsByVerificationStatus, totalProviders] = await Promise.all([
    prisma.providerProfile.findMany({
      where: { createdAt: { gte: start, lte: end } },
      select: { createdAt: true, verificationStatus: true },
    }),
    prisma.providerProfile.groupBy({ by: ["verificationStatus"], _count: { verificationStatus: true } }),
    prisma.providerProfile.count(),
  ]);

  const newProvidersByPeriod = buildTimeSeries(providers, start, end, query.groupBy, (rows) => ({ count: rows.length }));

  return {
    range: { start, end, groupBy: query.groupBy },
    newProvidersByPeriod,
    totalsByVerificationStatus: Object.fromEntries(
      totalsByVerificationStatus.map((r) => [r.verificationStatus, r._count.verificationStatus]),
    ),
    totalProviders,
  };
}

export async function getBookingsReport(query: TimeSeriesQuery) {
  const { start, end } = resolveTimeSeriesRange(query);
  const [bookings, totalsByStatus] = await Promise.all([
    prisma.booking.findMany({ where: { createdAt: { gte: start, lte: end } }, select: { createdAt: true, status: true } }),
    prisma.booking.groupBy({ by: ["status"], _count: { status: true } }),
  ]);

  const newBookingsByPeriod = buildTimeSeries(bookings, start, end, query.groupBy, (rows) => ({
    count: rows.length,
    byStatus: countBy(rows, (r) => r.status),
  }));

  return {
    range: { start, end, groupBy: query.groupBy },
    newBookingsByPeriod,
    totalsByStatus: Object.fromEntries(totalsByStatus.map((r) => [r.status, r._count.status])),
  };
}

export async function getRevenueReport(query: TimeSeriesQuery) {
  const { start, end } = resolveTimeSeriesRange(query);
  const [payments, settings] = await Promise.all([
    prisma.payment.findMany({
      where: { status: "RELEASED", createdAt: { gte: start, lte: end } },
      select: { createdAt: true, amount: true },
    }),
    getPlatformSettings(),
  ]);

  const revenueByPeriod = buildTimeSeries(payments, start, end, query.groupBy, (rows) => ({
    grossAmount: round2(rows.reduce((sum, r) => sum + Number(r.amount), 0)),
    paymentCount: rows.length,
  }));

  const totalGrossRevenue = round2(payments.reduce((sum, r) => sum + Number(r.amount), 0));
  const commissionPercent = Number(settings.commissionPercent);

  return {
    range: { start, end, groupBy: query.groupBy },
    revenueByPeriod,
    totalGrossRevenue,
    estimatedCommissionCollected: round2(totalGrossRevenue * (commissionPercent / 100)),
    note: "estimatedCommissionCollected uses the *current* commission percent, not historical per-payment rates (same approximation as FR23/FR24's revenue figures).",
  };
}

export async function getServicePopularityReport(query: RankingQuery) {
  const { start, end } = resolvePlainRange(query);
  const bookings = await prisma.booking.findMany({
    where: { createdAt: { gte: start, lte: end } },
    select: {
      listingId: true,
      listing: {
        select: {
          title: true,
          providerProfile: { select: { displayName: true } },
          categories: { select: { id: true, name: true } },
        },
      },
    },
  });

  const listingCounts = new Map<string, { title: string; providerDisplayName: string; bookingCount: number }>();
  const categoryCounts = new Map<string, { name: string; bookingCount: number }>();

  for (const booking of bookings) {
    const existingListing = listingCounts.get(booking.listingId);
    if (existingListing) {
      existingListing.bookingCount += 1;
    } else {
      listingCounts.set(booking.listingId, {
        title: booking.listing.title,
        providerDisplayName: booking.listing.providerProfile.displayName,
        bookingCount: 1,
      });
    }

    for (const category of booking.listing.categories) {
      const existingCategory = categoryCounts.get(category.id);
      if (existingCategory) {
        existingCategory.bookingCount += 1;
      } else {
        categoryCounts.set(category.id, { name: category.name, bookingCount: 1 });
      }
    }
  }

  const topListings = [...listingCounts.entries()]
    .map(([listingId, v]) => ({ listingId, ...v }))
    .sort((a, b) => b.bookingCount - a.bookingCount)
    .slice(0, query.limit);

  const topCategories = [...categoryCounts.entries()]
    .map(([categoryId, v]) => ({ categoryId, ...v }))
    .sort((a, b) => b.bookingCount - a.bookingCount)
    .slice(0, query.limit);

  return { range: { start, end }, topListings, topCategories };
}

export async function getCustomerSatisfactionReport(query: TimeSeriesQuery) {
  const { start, end } = resolveTimeSeriesRange(query);
  const [reviews, disputeCount, bookingCount] = await Promise.all([
    prisma.review.findMany({ where: { createdAt: { gte: start, lte: end } }, select: { createdAt: true, rating: true } }),
    prisma.dispute.count({ where: { createdAt: { gte: start, lte: end } } }),
    prisma.booking.count({ where: { createdAt: { gte: start, lte: end } } }),
  ]);

  const averageRatingByPeriod = buildTimeSeries(reviews, start, end, query.groupBy, (rows) => ({
    averageRating: rows.length > 0 ? round2(rows.reduce((sum, r) => sum + r.rating, 0) / rows.length) : null,
    reviewCount: rows.length,
  }));

  const ratingDistribution: Record<string, number> = { "1": 0, "2": 0, "3": 0, "4": 0, "5": 0 };
  for (const review of reviews) {
    const key = String(review.rating);
    ratingDistribution[key] = (ratingDistribution[key] ?? 0) + 1;
  }

  return {
    range: { start, end, groupBy: query.groupBy },
    averageRatingByPeriod,
    ratingDistribution,
    totalReviews: reviews.length,
    totalDisputes: disputeCount,
    totalBookings: bookingCount,
    disputeRate: bookingCount > 0 ? round4(disputeCount / bookingCount) : null,
    note: "disputeRate = disputes opened in range / bookings created in range — a rough proxy for satisfaction, not a true survey metric (none exists in this app).",
  };
}

export async function getProviderPerformanceReport(query: RankingQuery) {
  const { start, end } = resolvePlainRange(query);
  const providers = await prisma.providerProfile.findMany({
    select: { id: true, displayName: true, lateCancellationCount: true, noShowCount: true },
  });
  const providerIds = providers.map((p) => p.id);

  const [bookingsInRange, ratingSummaries, balances] = await Promise.all([
    prisma.booking.findMany({
      where: { providerProfileId: { in: providerIds }, createdAt: { gte: start, lte: end } },
      select: { providerProfileId: true, status: true },
    }),
    getProviderRatingSummaries(providerIds),
    prisma.providerBalance.findMany({ where: { providerProfileId: { in: providerIds } } }),
  ]);

  const balanceByProvider = new Map(balances.map((b) => [b.providerProfileId, Number(b.availableBalance)]));
  const bookingStatsByProvider = new Map<string, { total: number; completed: number }>();
  for (const booking of bookingsInRange) {
    const entry = bookingStatsByProvider.get(booking.providerProfileId) ?? { total: 0, completed: 0 };
    entry.total += 1;
    if (booking.status === "COMPLETED") {
      entry.completed += 1;
    }
    bookingStatsByProvider.set(booking.providerProfileId, entry);
  }

  const rows = providers.map((provider) => {
    const bookingStats = bookingStatsByProvider.get(provider.id) ?? { total: 0, completed: 0 };
    const rating = ratingSummaries.get(provider.id) ?? { averageRating: null, reviewCount: 0 };
    return {
      providerProfileId: provider.id,
      displayName: provider.displayName,
      bookingsInRange: bookingStats.total,
      completedBookingsInRange: bookingStats.completed,
      averageRating: rating.averageRating,
      reviewCount: rating.reviewCount,
      currentBalance: balanceByProvider.get(provider.id) ?? 0,
      lateCancellationCount: provider.lateCancellationCount,
      noShowCount: provider.noShowCount,
    };
  });

  rows.sort((a, b) => b.completedBookingsInRange - a.completedBookingsInRange);

  return {
    range: { start, end },
    providers: rows.slice(0, query.limit),
    note: "lateCancellationCount/noShowCount/currentBalance are lifetime totals, not scoped to range. bookingsInRange/completedBookingsInRange are scoped to range.",
  };
}

export async function getFinancialReport(query: PlainRangeQuery) {
  const { start, end } = resolvePlainRange(query);
  const [releasedAgg, refundedAgg, withdrawalsAgg, billsByStatus, paymentsByGateway, settings] = await Promise.all([
    prisma.payment.aggregate({
      where: { status: "RELEASED", createdAt: { gte: start, lte: end } },
      _sum: { amount: true },
      _count: { _all: true },
    }),
    prisma.payment.aggregate({
      where: { status: "REFUNDED", createdAt: { gte: start, lte: end } },
      _sum: { amount: true },
      _count: { _all: true },
    }),
    prisma.withdrawalRequest.aggregate({
      where: { createdAt: { gte: start, lte: end } },
      _sum: { amount: true },
      _count: { _all: true },
    }),
    prisma.offlinePaymentBill.groupBy({ by: ["status"], where: { createdAt: { gte: start, lte: end } }, _count: { status: true } }),
    prisma.payment.groupBy({ by: ["gateway"], where: { createdAt: { gte: start, lte: end } }, _count: { gateway: true } }),
    getPlatformSettings(),
  ]);

  const grossRevenue = round2(Number(releasedAgg._sum.amount ?? 0));
  const commissionPercent = Number(settings.commissionPercent);

  return {
    range: { start, end },
    grossRevenue,
    totalRefunded: round2(Number(refundedAgg._sum.amount ?? 0)),
    totalWithdrawn: round2(Number(withdrawalsAgg._sum.amount ?? 0)),
    estimatedCommissionCollected: round2(grossRevenue * (commissionPercent / 100)),
    releasedPaymentCount: releasedAgg._count._all,
    refundedPaymentCount: refundedAgg._count._all,
    withdrawalCount: withdrawalsAgg._count._all,
    offlineBillsByStatus: Object.fromEntries(billsByStatus.map((b) => [b.status, b._count.status])),
    paymentsByGateway: Object.fromEntries(paymentsByGateway.map((p) => [p.gateway, p._count.gateway])),
    note: "estimatedCommissionCollected uses the current commission percent, not historical per-payment rates (same approximation as FR23/FR24).",
  };
}

export async function getGrowthReport(query: TimeSeriesQuery) {
  const { start, end } = resolveTimeSeriesRange(query);
  const [users, bookings, payments] = await Promise.all([
    prisma.user.findMany({ where: { createdAt: { gte: start, lte: end } }, select: { createdAt: true } }),
    prisma.booking.findMany({ where: { createdAt: { gte: start, lte: end } }, select: { createdAt: true } }),
    prisma.payment.findMany({
      where: { status: "RELEASED", createdAt: { gte: start, lte: end } },
      select: { createdAt: true, amount: true },
    }),
  ]);

  return {
    range: { start, end, groupBy: query.groupBy },
    newUsersByPeriod: buildTimeSeries(users, start, end, query.groupBy, (rows) => ({ count: rows.length })),
    newBookingsByPeriod: buildTimeSeries(bookings, start, end, query.groupBy, (rows) => ({ count: rows.length })),
    revenueByPeriod: buildTimeSeries(payments, start, end, query.groupBy, (rows) => ({
      grossAmount: round2(rows.reduce((sum, r) => sum + Number(r.amount), 0)),
    })),
    note: "Combines the same underlying time-series as the Users/Bookings/Revenue reports into one growth-focused view.",
  };
}
