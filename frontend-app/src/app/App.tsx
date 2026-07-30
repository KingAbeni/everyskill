import React, { useState, useEffect, useCallback } from "react";
import {
  Search, MapPin, Star, Heart, Bell, MessageSquare, Home,
  Calendar, User, ChevronRight, ChevronLeft, Check, X, Camera,
  Upload, Clock, Shield, Briefcase, DollarSign, Filter, Phone,
  MoreVertical, Send, TrendingUp, ArrowLeft, Plus, Edit,
  Trash2, AlertTriangle, CheckCircle, Zap, Award, CreditCard, Lock,
  Eye, EyeOff, Paperclip, Settings, LogOut, ChevronDown, Globe,
  Bookmark, Share2, Info, FileText, Users, Activity,
  ArrowRight, ThumbsUp, Flag, Sliders, Building2, UserPlus, Wallet,
  RefreshCw, Cpu, Mail, Package, BarChart2, Map, Download,
  QrCode, ScanLine, ImagePlus, Pencil, Wifi,
} from "lucide-react";
import {
  AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer,
} from "recharts";

// ─── Types ─────────────────────────────────────────────────────────────────
type ScreenId =
  | "splash" | "login" | "signup" | "providerOnboarding" | "verificationPending"
  | "customerHome" | "aiSearch" | "filters" | "providerProfile" | "serviceDetail"
  | "bookingRequest" | "payment" | "bookingConfirmation" | "quoteWaiting" | "bookingDetail"
  | "chat" | "notifications" | "review" | "customerDashboard"
  | "providerDashboard" | "providerListings" | "createListing" | "providerCalendar"
  | "bookingInbox" | "providerCertificates" | "providerReviews" | "providerBilling"
  | "adminDashboard" | "kycReview" | "disputeResolution"
  | "designSystem";

type FlowId = "onboarding" | "customer" | "provider" | "admin" | "designSystem";

type UserRole = "customer" | "provider-individual" | "provider-business" | null;

const AuthContext = React.createContext<{
  isLoggedIn: boolean;
  userRole: UserRole;
  login: (role: UserRole) => void;
  logout: () => void;
}>({ isLoggedIn: false, userRole: null, login: () => {}, logout: () => {} });

const PROTECTED: ScreenId[] = [
  "bookingRequest", "payment", "bookingConfirmation", "bookingDetail",
  "chat", "review", "customerDashboard", "notifications",
  "providerDashboard", "providerListings", "createListing", "providerCalendar",
  "bookingInbox", "providerCertificates", "providerReviews", "providerOnboarding",
];

const GATE_REASON: Partial<Record<ScreenId, string>> = {
  bookingRequest: "Sign in to book a service.",
  payment: "Sign in to complete payment.",
  chat: "Sign in to message providers.",
  review: "Sign in to leave a review.",
  customerDashboard: "Sign in to view your bookings.",
  notifications: "Sign in to see your notifications.",
  providerDashboard: "Sign in to access your provider dashboard.",
  createListing: "Sign in to create a service listing.",
};

// ─── Auth Gate Modal ─────────────────────────────────────────────────────────
const AuthGateModal = ({ reason, onLogin, onSignup, onDismiss }: {
  reason: string;
  onLogin: () => void;
  onSignup: () => void;
  onDismiss: () => void;
}) => (
  <div className="absolute inset-0 z-[200] flex items-end justify-center bg-black/50 backdrop-blur-sm">
    <div className="w-full bg-card rounded-t-3xl px-6 pt-6 pb-10 shadow-2xl">
      <div className="w-10 h-1 bg-border rounded-full mx-auto mb-6" />
      <div className="w-14 h-14 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto mb-4">
        <Lock className="w-7 h-7 text-primary" />
      </div>
      <h2 className="text-xl font-bold text-foreground text-center mb-2" style={{ fontFamily: "Plus Jakarta Sans, sans-serif" }}>Sign in required</h2>
      <p className="text-sm text-muted-foreground text-center mb-6">{reason}</p>
      <div className="space-y-3">
        <Btn variant="primary" full onClick={onLogin}>Log In</Btn>
        <Btn variant="accent" full onClick={onSignup}><UserPlus className="w-4 h-4" /> Create Free Account</Btn>
        <button onClick={onDismiss} className="w-full text-sm text-muted-foreground py-2 hover:text-foreground transition-colors">Continue browsing</button>
      </div>
    </div>
  </div>
);

// ─── Toast / Notification Context ───────────────────────────────────────────
type ToastItem = { id: number; title: string; body: string; icon: React.ElementType; color: string; bg: string; screen?: ScreenId };

const ToastContext = React.createContext<{
  toasts: ToastItem[];
  push: (t: Omit<ToastItem, "id">) => void;
  dismiss: (id: number) => void;
  notifLog: ToastItem[];
}>({ toasts: [], push: () => {}, dismiss: () => {}, notifLog: [] });

// ─── In-App Toast Banner ─────────────────────────────────────────────────────
const ToastBanner = ({ toast, onDismiss, onTap }: { toast: ToastItem; onDismiss: () => void; onTap: () => void }) => {
  useEffect(() => {
    const t = setTimeout(onDismiss, 4000);
    return () => clearTimeout(t);
  }, [onDismiss]);
  const I = toast.icon;
  return (
    <div
      className="absolute top-16 left-3 right-3 z-[300] flex items-center gap-3 bg-white rounded-2xl shadow-xl px-4 py-3 border border-border/60 cursor-pointer"
      style={{ animation: "slideDown 0.3s ease" }}
      onClick={onTap}
    >
      <div className={`w-9 h-9 rounded-xl ${toast.bg} flex items-center justify-center shrink-0`}>
        <I className={`w-5 h-5 ${toast.color}`} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-sm font-semibold text-foreground truncate">{toast.title}</div>
        <div className="text-xs text-muted-foreground truncate">{toast.body}</div>
      </div>
      <button onClick={e => { e.stopPropagation(); onDismiss(); }} className="text-muted-foreground hover:text-foreground shrink-0">
        <X className="w-4 h-4" />
      </button>
    </div>
  );
};

// ─── Quote Context ───────────────────────────────────────────────────────────
type QuoteStatus = "none" | "waiting" | "quoted" | "accepted" | "declined";
type QuoteData = { duration: string; price: string; note: string } | null;

const QuoteContext = React.createContext<{
  quoteStatus: QuoteStatus;
  quotePhotos: string[];
  quoteData: QuoteData;
  setQuoteStatus: (s: QuoteStatus) => void;
  setQuotePhotos: (p: string[]) => void;
  setQuoteData: (d: QuoteData) => void;
}>({
  quoteStatus: "none", quotePhotos: [], quoteData: null,
  setQuoteStatus: () => {}, setQuotePhotos: () => {}, setQuoteData: () => {},
});

// ─── Photo Picker Sheet ──────────────────────────────────────────────────────
const PhotoPickerSheet = ({ label, onClose, onPick }: { label: string; onClose: () => void; onPick: (url: string) => void }) => {
  const samples = [
    "https://images.unsplash.com/photo-1508214751196-bcfd4ca60f91?w=300&h=300&fit=crop&auto=format",
    "https://images.unsplash.com/photo-1531746020798-e6953c6e8e04?w=300&h=300&fit=crop&auto=format",
    "https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=300&h=300&fit=crop&auto=format",
    "https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=300&h=300&fit=crop&auto=format",
    "https://images.unsplash.com/photo-1438761681033-6461ffad8d80?w=300&h=300&fit=crop&auto=format",
    "https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=300&h=300&fit=crop&auto=format",
  ];
  return (
    <div className="absolute inset-0 z-[250] flex items-end" onClick={onClose}>
      <div className="w-full bg-card rounded-t-3xl p-5 pb-8 shadow-2xl" onClick={e => e.stopPropagation()}>
        <div className="w-10 h-1 bg-border rounded-full mx-auto mb-4" />
        <h3 className="text-base font-bold text-foreground mb-1" style={{ fontFamily: "Plus Jakarta Sans, sans-serif" }}>{label}</h3>
        <p className="text-xs text-muted-foreground mb-4">Choose a photo or take one</p>
        <div className="flex gap-3 mb-4">
          <button className="flex-1 flex flex-col items-center gap-2 bg-background border-2 border-dashed border-border rounded-2xl py-4 hover:border-primary transition-colors">
            <Camera className="w-6 h-6 text-primary" />
            <span className="text-xs font-medium text-foreground">Camera</span>
          </button>
          <button className="flex-1 flex flex-col items-center gap-2 bg-background border-2 border-dashed border-border rounded-2xl py-4 hover:border-primary transition-colors">
            <ImagePlus className="w-6 h-6 text-primary" />
            <span className="text-xs font-medium text-foreground">Gallery</span>
          </button>
        </div>
        <div className="text-xs font-semibold text-muted-foreground mb-2 uppercase tracking-wide">Sample photos</div>
        <div className="grid grid-cols-3 gap-2">
          {samples.map((url, i) => (
            <button key={i} onClick={() => onPick(url)} className="aspect-square rounded-xl overflow-hidden border-2 border-transparent hover:border-primary transition-all">
              <img src={url} alt="" className="w-full h-full object-cover" />
            </button>
          ))}
        </div>
        <button onClick={onClose} className="w-full mt-4 text-sm text-muted-foreground py-2 hover:text-foreground">Cancel</button>
      </div>
    </div>
  );
};

// ─── QR Check-In Modal ───────────────────────────────────────────────────────
const QRCodeDisplay = ({ bookingRef, onClose }: { bookingRef: string; onClose: () => void }) => (
  <div className="absolute inset-0 z-[250] flex flex-col items-center justify-center bg-slate-900" onClick={onClose}>
    <div className="text-center px-8" onClick={e => e.stopPropagation()}>
      <div className="w-14 h-14 rounded-full bg-green-500/20 flex items-center justify-center mx-auto mb-4">
        <QrCode className="w-8 h-8 text-green-400" />
      </div>
      <h2 className="text-xl font-bold text-white mb-1" style={{ fontFamily: "Plus Jakarta Sans, sans-serif" }}>{"You're On Site"}</h2>
      <p className="text-white/60 text-sm mb-6">Ask the customer to scan this code to confirm your arrival</p>
      {/* Simulated QR code */}
      <div className="w-52 h-52 bg-white rounded-2xl mx-auto flex items-center justify-center mb-4 p-3">
        <svg viewBox="0 0 100 100" className="w-full h-full">
          {/* QR grid simulation */}
          {[0,1,2,3,4,5,6].map(r => [0,1,2,3,4,5,6].map(c => {
            const corner = (r<3&&c<3)||(r<3&&c>3)||(r>3&&c<3);
            const filled = corner ? ((r===0||r===2||c===0||c===2)||((r===1&&c===1)||(r===1&&c===5)||(r===5&&c===1))) : Math.random()>0.5;
            return filled ? <rect key={`${r}-${c}`} x={r*13+2} y={c*13+2} width={11} height={11} rx={1} fill="#1565C0" /> : null;
          }))}
          <rect x={2} y={2} width={37} height={37} rx={2} fill="none" stroke="#1565C0" strokeWidth={3} />
          <rect x={61} y={2} width={37} height={37} rx={2} fill="none" stroke="#1565C0" strokeWidth={3} />
          <rect x={2} y={61} width={37} height={37} rx={2} fill="none" stroke="#1565C0" strokeWidth={3} />
        </svg>
      </div>
      <div className="bg-white/10 rounded-xl px-4 py-2 mb-6">
        <div className="text-white/60 text-[10px] font-medium">Booking reference</div>
        <div className="text-white font-bold text-lg tracking-widest">{bookingRef}</div>
      </div>
      <button onClick={onClose} className="w-full bg-white/15 text-white font-semibold rounded-2xl py-3 hover:bg-white/20">Close</button>
    </div>
  </div>
);

const QRScannerView = ({ onScanned, onClose }: { onScanned: () => void; onClose: () => void }) => (
  <div className="absolute inset-0 z-[250] flex flex-col bg-black" onClick={onClose}>
    <div className="flex items-center gap-3 px-4 py-4" onClick={e => e.stopPropagation()}>
      <button onClick={onClose} className="w-9 h-9 rounded-full bg-white/10 flex items-center justify-center">
        <ArrowLeft className="w-4 h-4 text-white" />
      </button>
      <span className="text-white font-semibold">Scan Provider Code</span>
    </div>
    <div className="flex-1 flex flex-col items-center justify-center px-8" onClick={e => e.stopPropagation()}>
      <div className="relative w-56 h-56 mb-6">
        {/* Camera viewfinder */}
        <div className="absolute inset-0 bg-white/5 rounded-3xl border-2 border-white/30" />
        <div className="absolute top-0 left-0 w-8 h-8 border-t-4 border-l-4 border-accent rounded-tl-xl" />
        <div className="absolute top-0 right-0 w-8 h-8 border-t-4 border-r-4 border-accent rounded-tr-xl" />
        <div className="absolute bottom-0 left-0 w-8 h-8 border-b-4 border-l-4 border-accent rounded-bl-xl" />
        <div className="absolute bottom-0 right-0 w-8 h-8 border-b-4 border-r-4 border-accent rounded-br-xl" />
        <div className="absolute top-1/2 left-4 right-4 h-0.5 bg-accent/80 animate-pulse" />
        <ScanLine className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-12 h-12 text-white/30" />
      </div>
      <p className="text-white/70 text-sm text-center mb-8">Point your camera at the {"provider's"} QR code</p>
      <Btn variant="accent" onClick={onScanned}>Simulate Successful Scan</Btn>
    </div>
  </div>
);

// ─── Mock Data ──────────────────────────────────────────────────────────────
const providers = [
  {
    id: 1, name: "Sarah Chen",
    avatar: "https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=120&h=120&fit=crop&auto=format",
    coverImg: "https://images.unsplash.com/photo-1581578731548-c64695cc6952?w=500&h=220&fit=crop&auto=format",
    rating: 4.9, reviews: 127, price: "$45/hr", distance: "0.8 mi", verified: true,
    badge: "Top Pro", specialty: "House Cleaning", skills: ["Deep Clean", "Move-out", "Eco Products"],
    why: "89% match · 5 bookings in your area", completedJobs: 312, responseTime: "~15 min",
    bio: "Professional cleaner with 6 years of experience. Eco-friendly products available on request. Fully insured and background-checked.",
    yearsExp: 6,
  },
  {
    id: 2, name: "Marcus Williams",
    avatar: "https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?w=120&h=120&fit=crop&auto=format",
    coverImg: "https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=500&h=220&fit=crop&auto=format",
    rating: 4.8, reviews: 89, price: "$65/hr", distance: "1.2 mi", verified: true,
    badge: "Background Checked", specialty: "Plumbing", skills: ["Leak Fix", "Installation", "Emergency"],
    why: "Available today · Licensed & insured", completedJobs: 247, responseTime: "~5 min",
    bio: "Licensed plumber with 10+ years fixing everything from drips to full bathroom installs. Emergency callouts available.",
    yearsExp: 10,
  },
  {
    id: 3, name: "Priya Sharma",
    avatar: "https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=120&h=120&fit=crop&auto=format",
    coverImg: "https://images.unsplash.com/photo-1587300003388-59208cc962cb?w=500&h=220&fit=crop&auto=format",
    rating: 4.7, reviews: 203, price: "$35/hr", distance: "0.4 mi", verified: true,
    badge: "Top Pro", specialty: "Dog Walking", skills: ["Daily Walks", "Pet Sitting", "Training"],
    why: "Closest match · Bonded & insured", completedJobs: 534, responseTime: "~3 min",
    bio: "Certified dog trainer and walker. I treat your pets like my own family. GPS-tracked walks, photo updates always included.",
    yearsExp: 4,
  },
];

const categories = [
  { icon: Home, label: "Cleaning", bg: "#EFF6FF", color: "#1565C0" },
  { icon: Zap, label: "Electrical", bg: "#FFFBEB", color: "#D97706" },
  { icon: Cpu, label: "Tech Help", bg: "#F0FDFA", color: "#0D9488" },
  { icon: Users, label: "Care", bg: "#FDF2F8", color: "#9333EA" },
  { icon: Activity, label: "Fitness", bg: "#F0FDF4", color: "#16A34A" },
  { icon: Briefcase, label: "Business", bg: "#F5F3FF", color: "#7C3AED" },
];

const earningsData = [
  { wk: "W1", v: 420 }, { wk: "W2", v: 680 }, { wk: "W3", v: 540 },
  { wk: "W4", v: 890 }, { wk: "W5", v: 720 }, { wk: "W6", v: 1100 },
  { wk: "W7", v: 980 }, { wk: "W8", v: 1240 }, { wk: "W9", v: 860 },
  { wk: "W10", v: 1340 }, { wk: "W11", v: 1560 }, { wk: "W12", v: 1820 },
];

// ─── Primitives ─────────────────────────────────────────────────────────────
const StatusBar = ({ dark = false }: { dark?: boolean }) => (
  <div className={`flex items-center justify-between px-6 pt-3 pb-1 text-xs font-semibold ${dark ? "text-white" : "text-foreground"}`}>
    <span>9:41</span>
    <div className="absolute top-3 left-1/2 -translate-x-1/2 w-[120px] h-[34px] bg-black rounded-full z-20" />
    <div className="flex items-center gap-1.5 z-30">
      <svg width="16" height="11" viewBox="0 0 16 11" fill="currentColor"><rect x="0" y="4" width="3" height="7" rx="1" opacity=".4"/><rect x="4.5" y="2.5" width="3" height="8.5" rx="1" opacity=".6"/><rect x="9" y="1" width="3" height="10" rx="1" opacity=".8"/><rect x="13.5" y="0" width="2.5" height="11" rx="1"/></svg>
      <svg width="15" height="11" viewBox="0 0 23 16" fill="none" stroke="currentColor" strokeWidth="2"><path d="M1 5C5.4 1.7 10.3 0 12 0c1.7 0 6.6 1.7 11 5"/><path d="M4 9c2.3-2 5-3 8-3s5.7 1 8 3"/><path d="M7 13c1.4-1.3 3.2-2 5-2s3.6.7 5 2"/><circle cx="12" cy="15" r="1" fill="currentColor" stroke="none"/></svg>
      <div className="relative w-[22px] h-[11px] rounded-[2px] border border-current">
        <div className="absolute inset-[2px] right-[3px] bg-current rounded-[1px]"/>
        <div className="absolute right-[-3px] top-[3px] w-[2px] h-[5px] bg-current rounded-r-[1px]"/>
      </div>
    </div>
  </div>
);

const Pill = ({ children, color = "blue", sm = false }: { children: React.ReactNode; color?: "blue"|"green"|"orange"|"red"|"purple"|"gray"|"gold"; sm?: boolean }) => {
  const map = {
    blue: "bg-blue-50 text-blue-700", green: "bg-green-50 text-green-700",
    orange: "bg-orange-50 text-orange-700", red: "bg-red-50 text-red-700",
    purple: "bg-purple-50 text-purple-700", gray: "bg-slate-100 text-slate-600",
    gold: "bg-amber-50 text-amber-700 border border-amber-200",
  };
  return <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full font-medium ${sm ? "text-[10px]" : "text-xs"} ${map[color]}`}>{children}</span>;
};

const Stars = ({ v, size = 14 }: { v: number; size?: number }) => (
  <div className="flex items-center gap-px">
    {[1,2,3,4,5].map(i => (
      <Star key={i} style={{ width: size, height: size }} className={i <= Math.round(v) ? "fill-amber-400 text-amber-400" : "text-slate-200 fill-slate-200"} />
    ))}
  </div>
);

const Btn = ({ children, variant = "primary", onClick, full = false, sm = false, className = "" }: {
  children: React.ReactNode; variant?: "primary"|"accent"|"outline"|"ghost"|"danger";
  onClick?: () => void; full?: boolean; sm?: boolean; className?: string;
}) => {
  const base = `inline-flex items-center justify-center gap-2 font-semibold rounded-2xl transition-all active:scale-95 ${full ? "w-full" : ""} ${sm ? "text-sm px-4 py-2" : "px-5 py-3"} ${className}`;
  const v = {
    primary: "bg-primary text-primary-foreground shadow-sm shadow-primary/20 hover:brightness-110",
    accent: "bg-accent text-accent-foreground shadow-sm shadow-accent/20 hover:brightness-110",
    outline: "border-2 border-primary text-primary bg-transparent hover:bg-primary/5",
    ghost: "text-primary bg-transparent hover:bg-primary/5",
    danger: "bg-destructive text-destructive-foreground hover:brightness-110",
  };
  return <button className={`${base} ${v[variant]}`} onClick={onClick}>{children}</button>;
};

const Input2 = ({ label, type = "text", placeholder, icon: Icon, value, onChange }: {
  label?: string; type?: string; placeholder?: string; icon?: React.ElementType;
  value?: string; onChange?: (v: string) => void;
}) => (
  <div>
    {label && <div className="text-xs font-semibold text-muted-foreground mb-1.5 uppercase tracking-wide">{label}</div>}
    <div className="flex items-center gap-3 bg-background border border-border rounded-xl px-4 py-3">
      {Icon && <Icon className="w-4 h-4 text-muted-foreground shrink-0" />}
      <input
        type={type} placeholder={placeholder}
        className="flex-1 text-sm bg-transparent outline-none text-foreground placeholder:text-muted-foreground"
        value={value} onChange={e => onChange?.(e.target.value)}
      />
    </div>
  </div>
);

const BottomNav = ({ active, onNav }: { active: string; onNav: (s: ScreenId) => void }) => {
  const tabs = [
    { id: "home", label: "Home", icon: Home, screen: "customerHome" as ScreenId },
    { id: "bookings", label: "Bookings", icon: Calendar, screen: "customerDashboard" as ScreenId },
    { id: "messages", label: "Messages", icon: MessageSquare, screen: "chat" as ScreenId },
    { id: "saved", label: "Saved", icon: Heart, screen: "customerDashboard" as ScreenId },
    { id: "profile", label: "Profile", icon: User, screen: "customerDashboard" as ScreenId },
  ];
  return (
    <div className="shrink-0 bg-card border-t border-border/50 flex items-center justify-around px-1 pb-5 pt-2 z-20">
      {tabs.map(t => {
        const I = t.icon;
        const on = active === t.id;
        return (
          <button key={t.id} onClick={() => onNav(t.screen)} className="flex flex-col items-center gap-0.5 px-3 py-1 rounded-xl transition-all">
            <I className={`w-5 h-5 transition-colors ${on ? "text-primary" : "text-muted-foreground"}`} style={on ? { fill: "rgba(21,101,192,0.15)" } : {}} />
            <span className={`text-[10px] font-medium ${on ? "text-primary" : "text-muted-foreground"}`}>{t.label}</span>
          </button>
        );
      })}
    </div>
  );
};

const ProviderCard = ({ p, onPress, showWhy = false }: { p: typeof providers[0]; onPress?: () => void; showWhy?: boolean }) => (
  <button onClick={onPress} className="w-full bg-card rounded-2xl shadow-sm border border-border/40 overflow-hidden text-left hover:shadow-md transition-shadow">
    <div className="relative h-28 bg-slate-100">
      <img src={p.coverImg} alt={p.specialty} className="w-full h-full object-cover" />
      <div className="absolute top-2 right-2">
        <Pill color="gold" sm><Award className="w-2.5 h-2.5" />{p.badge}</Pill>
      </div>
    </div>
    <div className="p-3">
      <div className="flex items-center gap-2.5">
        <div className="relative">
          <img src={p.avatar} alt={p.name} className="w-10 h-10 rounded-full object-cover border-2 border-white shadow-sm" />
          {p.verified && <div className="absolute -bottom-0.5 -right-0.5 w-4 h-4 bg-blue-500 rounded-full flex items-center justify-center border border-white"><Check className="w-2.5 h-2.5 text-white" /></div>}
        </div>
        <div className="flex-1 min-w-0">
          <div className="font-semibold text-sm text-foreground">{p.name}</div>
          <div className="text-xs text-muted-foreground">{p.specialty}</div>
        </div>
        <div className="text-right">
          <div className="font-bold text-sm text-foreground">{p.price}</div>
          <div className="text-[10px] text-muted-foreground flex items-center gap-0.5 justify-end"><MapPin className="w-2.5 h-2.5" />{p.distance}</div>
        </div>
      </div>
      <div className="flex items-center gap-2 mt-2">
        <Stars v={p.rating} size={11} />
        <span className="text-xs text-muted-foreground">{p.rating} ({p.reviews} reviews)</span>
      </div>
      {showWhy && (
        <div className="mt-2 flex items-center gap-1.5 bg-primary/5 rounded-xl px-2.5 py-1.5">
          <Zap className="w-3 h-3 text-primary shrink-0" />
          <span className="text-[10px] text-primary font-medium">{p.why}</span>
        </div>
      )}
    </div>
  </button>
);

const BackHeader = ({ title, onBack, light = false, action }: { title: string; onBack?: () => void; light?: boolean; action?: React.ReactNode }) => (
  <div className={`flex items-center justify-between px-4 py-3 ${light ? "text-white" : "text-foreground"}`}>
    <button onClick={onBack} className={`w-9 h-9 rounded-full flex items-center justify-center ${light ? "bg-white/15" : "bg-background"}`}>
      <ArrowLeft className="w-4 h-4" />
    </button>
    <span className="font-semibold text-base">{title}</span>
    <div className="w-9 h-9 flex items-center justify-center">{action}</div>
  </div>
);

const Divider = ({ label }: { label?: string }) => (
  <div className="flex items-center gap-3 my-1">
    <div className="flex-1 h-px bg-border" />
    {label && <span className="text-xs text-muted-foreground font-medium">{label}</span>}
    <div className="flex-1 h-px bg-border" />
  </div>
);

// ─── Onboarding Screens ─────────────────────────────────────────────────────
const SplashScreen = ({ onNav }: { onNav: (s: ScreenId) => void }) => (
  <div className="flex flex-col h-full" style={{ background: "linear-gradient(160deg, #0D3270 0%, #1565C0 55%, #0D9488 100%)" }}>
    <StatusBar dark />
    <div className="flex-1 flex flex-col items-center justify-center px-8 pt-4">
      <div className="w-20 h-20 rounded-3xl bg-white/15 backdrop-blur-sm flex items-center justify-center mb-6 shadow-2xl">
        <Zap className="w-10 h-10 text-white" />
      </div>
      <h1 className="text-4xl font-extrabold text-white text-center leading-tight mb-3" style={{ fontFamily: "Plus Jakarta Sans, sans-serif" }}>
        Every<span className="text-amber-300">Skill</span>
      </h1>
      <p className="text-white/70 text-center text-base leading-relaxed mb-2">
        Hire trusted professionals or grow your service business — all in one place.
      </p>
      <div className="flex items-center gap-4 mt-4 mb-8">
        {["50K+ Providers", "4.9★ Rated", "Escrow Safe"].map(s => (
          <div key={s} className="text-center">
            <div className="text-white/50 text-[10px] font-medium bg-white/10 rounded-full px-2 py-0.5">{s}</div>
          </div>
        ))}
      </div>
      <div className="relative w-full rounded-3xl overflow-hidden shadow-2xl mb-6 aspect-[4/3]">
        <img src="https://images.unsplash.com/photo-1600880292203-757bb62b4baf?w=400&h=300&fit=crop&auto=format" alt="Services" className="w-full h-full object-cover" />
        <div className="absolute inset-0 bg-gradient-to-t from-black/50 to-transparent" />
        <div className="absolute bottom-4 left-4 right-4">
          <div className="flex gap-2">
            {providers.slice(0,3).map(p => (
              <div key={p.id} className="flex items-center gap-1.5 bg-white/90 backdrop-blur-sm rounded-full px-2.5 py-1.5">
                <img src={p.avatar} alt={p.name} className="w-5 h-5 rounded-full object-cover" />
                <span className="text-[10px] font-semibold text-slate-800">{p.name.split(" ")[0]}</span>
                <span className="text-[10px] text-amber-500 font-bold">★{p.rating}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
    <div className="px-6 pb-10 space-y-3">
      <Btn variant="accent" full onClick={() => onNav("signup")}>
        <UserPlus className="w-4 h-4" /> Get started — it's free
      </Btn>
      <div className="grid grid-cols-2 gap-2">
        <button onClick={() => onNav("customerHome")} className="flex items-center justify-center gap-1.5 text-sm font-semibold text-white/80 bg-white/10 rounded-2xl py-3 hover:bg-white/15 transition-colors border border-white/20">
          <User className="w-4 h-4" /> Browse first
        </button>
        <button onClick={() => onNav("signup")} className="flex items-center justify-center gap-1.5 text-sm font-semibold text-white/80 bg-white/10 rounded-2xl py-3 hover:bg-white/15 transition-colors border border-white/20">
          <Briefcase className="w-4 h-4" /> Offer skills
        </button>
      </div>
      <button className="w-full text-center text-white/60 text-sm py-2" onClick={() => onNav("login")}>
        Already have an account? <span className="text-white font-semibold underline">Log in</span>
      </button>
    </div>
  </div>
);

const LoginScreen = ({ onNav }: { onNav: (s: ScreenId) => void }) => {
  const { login } = React.useContext(AuthContext);
  const [showPass, setShowPass] = useState(false);
  const handleLogin = () => { login("customer"); onNav("customerHome"); };
  return (
    <div className="flex flex-col h-full bg-card">
      <StatusBar />
      <div className="flex items-center px-4 py-2">
        <button onClick={() => onNav("splash")} className="w-9 h-9 rounded-full bg-background flex items-center justify-center">
          <ArrowLeft className="w-4 h-4 text-foreground" />
        </button>
      </div>
      <div className="flex-1 px-6 py-4 overflow-y-auto">
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-foreground mb-1" style={{ fontFamily: "Plus Jakarta Sans, sans-serif" }}>Welcome back</h1>
          <p className="text-muted-foreground text-sm">Sign in to continue to EverySkill</p>
        </div>
        <div className="space-y-4 mb-6">
          <Input2 label="Email address" type="email" placeholder="you@example.com" icon={Mail} />
          <div>
            <div className="text-xs font-semibold text-muted-foreground mb-1.5 uppercase tracking-wide">Password</div>
            <div className="flex items-center gap-3 bg-background border border-border rounded-xl px-4 py-3">
              <Lock className="w-4 h-4 text-muted-foreground" />
              <input type={showPass ? "text" : "password"} placeholder="••••••••" className="flex-1 text-sm bg-transparent outline-none text-foreground placeholder:text-muted-foreground" />
              <button onClick={() => setShowPass(!showPass)}>
                {showPass ? <EyeOff className="w-4 h-4 text-muted-foreground" /> : <Eye className="w-4 h-4 text-muted-foreground" />}
              </button>
            </div>
          </div>
          <div className="text-right">
            <button className="text-sm text-primary font-medium">Forgot password?</button>
          </div>
        </div>
        <Btn variant="primary" full onClick={handleLogin}>Sign In</Btn>
        <Divider label="or continue with" />
        <div className="grid grid-cols-3 gap-3 mb-6">
          {[{ icon: Globe, label: "Google" }, { icon: Mail, label: "Apple" }, { icon: Users, label: "Facebook" }].map(s => (
            <button key={s.label} className="flex flex-col items-center gap-1.5 border border-border rounded-xl py-3 hover:bg-background transition-colors">
              <s.icon className="w-5 h-5 text-foreground" />
              <span className="text-[10px] font-medium text-muted-foreground">{s.label}</span>
            </button>
          ))}
        </div>
        <p className="text-center text-sm text-muted-foreground">
          No account?{" "}
          <button className="text-primary font-semibold" onClick={() => onNav("signup")}>Create one free</button>
        </p>
      </div>
    </div>
  );
};

const SignupScreen = ({ onNav }: { onNav: (s: ScreenId) => void }) => {
  const { login } = React.useContext(AuthContext);
  const [role, setRole] = useState<"customer"|"individual"|"business">("customer");
  const handleCreate = () => {
    const roleMap = {
      customer: "customer" as UserRole,
      individual: "provider-individual" as UserRole,
      business: "provider-business" as UserRole,
    };
    login(roleMap[role]);
    if (role === "customer") onNav("customerHome");
    else onNav("providerOnboarding");
  };
  return (
    <div className="flex flex-col h-full bg-card overflow-hidden">
      <StatusBar />
      <div className="flex items-center px-4 py-2 shrink-0">
        <button onClick={() => onNav("login")} className="w-9 h-9 rounded-full bg-background flex items-center justify-center">
          <ArrowLeft className="w-4 h-4" />
        </button>
      </div>
      <div className="flex-1 px-6 py-4 overflow-y-auto" style={{ scrollbarWidth: "none" }}>
        <div className="mb-5">
          <h1 className="text-2xl font-bold text-foreground mb-1" style={{ fontFamily: "Plus Jakarta Sans, sans-serif" }}>Create account</h1>
          <p className="text-muted-foreground text-sm">Join 50,000+ people on EverySkill</p>
        </div>
        {/* Role selector */}
        <div className="mb-5">
          <div className="text-xs font-semibold text-muted-foreground mb-2 uppercase tracking-wide">I want to…</div>
          <div className="space-y-2">
            {([
              { id: "customer", icon: User, label: "Book services", sub: "Find and hire skilled professionals" },
              { id: "individual", icon: Briefcase, label: "Offer my skills", sub: "Individual freelancer or sole trader" },
              { id: "business", icon: Building2, label: "Offer services as a business", sub: "Company, agency, or team" },
            ] as const).map(opt => {
              const I = opt.icon;
              return (
                <button key={opt.id} onClick={() => setRole(opt.id)} className={`w-full flex items-center gap-3 rounded-2xl border-2 p-3.5 text-left transition-all ${role === opt.id ? "border-primary bg-primary/5" : "border-border bg-background"}`}>
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${role === opt.id ? "bg-primary text-white" : "bg-muted text-muted-foreground"}`}>
                    <I className="w-5 h-5" />
                  </div>
                  <div>
                    <div className={`text-sm font-semibold ${role === opt.id ? "text-primary" : "text-foreground"}`}>{opt.label}</div>
                    <div className="text-xs text-muted-foreground">{opt.sub}</div>
                  </div>
                  {role === opt.id && <Check className="w-4 h-4 text-primary ml-auto shrink-0" />}
                </button>
              );
            })}
          </div>
        </div>
        <div className="space-y-3 mb-5">
          <div className="grid grid-cols-2 gap-3">
            <Input2 label="First name" placeholder="Jane" />
            <Input2 label="Last name" placeholder="Smith" />
          </div>
          {role === "business" && <Input2 label="Company name" placeholder="Acme Cleaning Ltd" icon={Building2} />}
          <Input2 label="Email" type="email" placeholder="you@example.com" icon={Mail} />
          <Input2 label="Phone" type="tel" placeholder="+1 (555) 000-0000" icon={Phone} />
          <Input2 label="Password" type="password" placeholder="Min. 8 characters" icon={Lock} />
        </div>
        <div className="flex items-start gap-3 mb-5 bg-background rounded-xl p-3">
          <div className="w-5 h-5 rounded-md bg-primary flex items-center justify-center shrink-0 mt-0.5">
            <Check className="w-3 h-3 text-white" />
          </div>
          <p className="text-xs text-muted-foreground leading-relaxed">
            I agree to the <span className="text-primary font-medium">Terms of Service</span> and <span className="text-primary font-medium">Privacy Policy</span>.
          </p>
        </div>
        <Btn variant="primary" full onClick={handleCreate}>
          {role === "customer" ? "Create Account" : "Start Provider Setup →"}
        </Btn>
        <Divider label="or" />
        <div className="grid grid-cols-3 gap-3 mb-4">
          {[Globe, Mail, Users].map((I, i) => (
            <button key={i} className="flex items-center justify-center border border-border rounded-xl py-3 hover:bg-background transition-colors">
              <I className="w-5 h-5 text-foreground" />
            </button>
          ))}
        </div>
        <p className="text-center text-sm text-muted-foreground">
          Have an account? <button className="text-primary font-semibold" onClick={() => onNav("login")}>Log in</button>
        </p>
      </div>
    </div>
  );
};

const ProviderOnboardingScreen = ({ onNav }: { onNav: (s: ScreenId) => void }) => {
  const [tab, setTab] = useState<"individual"|"business">("individual");
  const [step, setStep] = useState(0);
  const steps = ["Profile", "Verification", "Services", "Go Live"];
  return (
    <div className="flex flex-col h-full bg-card">
      <StatusBar />
      <BackHeader title="Provider Setup" onBack={() => onNav("splash")} />
      <div className="flex gap-1 px-4 mb-4">
        {steps.map((s, i) => (
          <div key={s} className="flex-1 flex flex-col items-center gap-1">
            <div className={`h-1.5 w-full rounded-full ${i <= step ? "bg-primary" : "bg-muted"}`} />
            <span className={`text-[9px] font-medium ${i === step ? "text-primary" : "text-muted-foreground"}`}>{s}</span>
          </div>
        ))}
      </div>
      <div className="flex-1 px-6 overflow-y-auto pb-6">
        <div className="flex gap-2 mb-6 bg-background rounded-2xl p-1">
          {(["individual", "business"] as const).map(t => (
            <button key={t} onClick={() => setTab(t)} className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-semibold transition-all ${tab === t ? "bg-primary text-white shadow-sm" : "text-muted-foreground"}`}>
              {t === "individual" ? <User className="w-4 h-4" /> : <Building2 className="w-4 h-4" />}
              {t === "individual" ? "Individual" : "Business"}
            </button>
          ))}
        </div>
        <div className="space-y-4">
          {tab === "business" && (
            <Input2 label="Business / Company Name" placeholder="Sparkle Clean LLC" icon={Building2} />
          )}
          <Input2 label="Full Legal Name" placeholder="Jane Smith" icon={User} />
          <Input2 label="Phone Number" placeholder="+1 (555) 000-0000" icon={Phone} />
          <Input2 label="Service Location" placeholder="San Francisco, CA" icon={MapPin} />
          <div>
            <div className="text-xs font-semibold text-muted-foreground mb-2 uppercase tracking-wide">Primary Category</div>
            <div className="grid grid-cols-3 gap-2">
              {categories.map((c, i) => {
                const I = c.icon;
                return (
                  <button key={c.label} className={`flex flex-col items-center gap-1.5 rounded-xl p-2.5 border-2 text-xs font-medium transition-all ${i === 0 ? "border-primary bg-primary/5 text-primary" : "border-border text-muted-foreground"}`}>
                    <I className="w-5 h-5" />
                    {c.label}
                  </button>
                );
              })}
            </div>
          </div>
          <div>
            <div className="text-xs font-semibold text-muted-foreground mb-2 uppercase tracking-wide">
              {tab === "business" ? "Business Registration Document" : "Government-Issued ID"}
            </div>
            <div className="border-2 border-dashed border-border rounded-2xl p-5 flex flex-col items-center gap-2 bg-background">
              <Upload className="w-8 h-8 text-muted-foreground" />
              <p className="text-sm font-medium text-foreground">Tap to upload</p>
              <p className="text-xs text-muted-foreground text-center">JPG, PNG or PDF · Max 10MB</p>
              <Btn variant="outline" sm>Choose File</Btn>
            </div>
          </div>
          {tab === "business" && (
            <div>
              <div className="text-xs font-semibold text-muted-foreground mb-2 uppercase tracking-wide">Director / Owner ID</div>
              <div className="border-2 border-dashed border-border rounded-2xl p-4 flex flex-col items-center gap-2 bg-background">
                <Camera className="w-7 h-7 text-muted-foreground" />
                <p className="text-xs text-muted-foreground">Passport or driving licence</p>
                <Btn variant="outline" sm>Upload ID</Btn>
              </div>
            </div>
          )}
        </div>
        <div className="mt-6">
          <Btn variant="primary" full onClick={() => onNav("verificationPending")}>
            Submit for Review <ArrowRight className="w-4 h-4" />
          </Btn>
        </div>
      </div>
    </div>
  );
};

const VerificationPendingScreen = ({ onNav }: { onNav: (s: ScreenId) => void }) => (
  <div className="flex flex-col h-full bg-card">
    <StatusBar />
    <div className="flex-1 flex flex-col items-center justify-center px-8 text-center">
      <div className="w-28 h-28 rounded-full bg-amber-50 flex items-center justify-center mb-8 shadow-lg shadow-amber-100">
        <div className="w-20 h-20 rounded-full bg-amber-100 flex items-center justify-center">
          <Clock className="w-10 h-10 text-amber-500" />
        </div>
      </div>
      <Pill color="orange"><RefreshCw className="w-3 h-3" />Under Review</Pill>
      <h1 className="text-2xl font-bold text-foreground mt-4 mb-3" style={{ fontFamily: "Plus Jakarta Sans, sans-serif" }}>
        {"We're reviewing your documents"}
      </h1>
      <p className="text-muted-foreground text-sm leading-relaxed mb-8">
        Our trust & safety team typically completes verification within <strong>1–2 business days</strong>. {"You'll"} get an email and push notification the moment {"you're"} approved.
      </p>
      <div className="w-full space-y-3 mb-8">
        {[
          { label: "Identity document", status: "Received", color: "green" as const },
          { label: "Background check", status: "In progress", color: "orange" as const },
          { label: "Phone verification", status: "Verified", color: "green" as const },
          { label: "Service listing review", status: "Pending", color: "gray" as const },
        ].map(r => (
          <div key={r.label} className="flex items-center justify-between bg-background rounded-xl px-4 py-3">
            <div className="flex items-center gap-3">
              <div className={`w-2 h-2 rounded-full ${r.color === "green" ? "bg-green-400" : r.color === "orange" ? "bg-amber-400" : "bg-slate-300"}`} />
              <span className="text-sm font-medium text-foreground">{r.label}</span>
            </div>
            <Pill color={r.color} sm>{r.status}</Pill>
          </div>
        ))}
      </div>
      <Btn variant="outline" full onClick={() => onNav("splash")}>Back to Home</Btn>
    </div>
  </div>
);

// ─── Customer Screens ────────────────────────────────────────────────────────
const CustomerHomeScreen = ({ onNav }: { onNav: (s: ScreenId) => void }) => (
  <div className="flex flex-col h-full bg-background overflow-hidden">
    <div style={{ background: "linear-gradient(160deg, #0D3270 0%, #1565C0 100%)" }}>
      <StatusBar dark />
      <div className="px-5 pt-1 pb-6">
        <div className="flex items-center justify-between mb-5">
          <div>
            <p className="text-white/70 text-sm">Good morning 👋</p>
            <h2 className="text-xl font-bold text-white" style={{ fontFamily: "Plus Jakarta Sans, sans-serif" }}>Find your pro, Alex</h2>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => onNav("notifications")} className="w-9 h-9 rounded-full bg-white/15 flex items-center justify-center relative">
              <Bell className="w-4 h-4 text-white" />
              <div className="absolute top-0.5 right-0.5 w-2.5 h-2.5 bg-accent rounded-full border border-white" />
            </button>
            <img src="https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=60&h=60&fit=crop&auto=format" alt="Alex" className="w-9 h-9 rounded-full object-cover border-2 border-white/40" />
          </div>
        </div>
        <button onClick={() => onNav("aiSearch")} className="w-full flex items-center gap-3 bg-white rounded-2xl px-4 py-3.5 shadow-lg shadow-black/10">
          <Zap className="w-4 h-4 text-primary shrink-0" />
          <span className="text-muted-foreground text-sm flex-1 text-left">Describe what you need...</span>
          <div className="bg-primary rounded-xl px-3 py-1.5">
            <Search className="w-4 h-4 text-white" />
          </div>
        </button>
      </div>
    </div>
    <div className="flex-1 overflow-y-auto pb-2" style={{ scrollbarWidth: "none" }}>
      <div className="px-5 pt-5">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-bold text-foreground" style={{ fontFamily: "Plus Jakarta Sans, sans-serif" }}>Categories</h3>
          <button className="text-xs text-primary font-medium">See all</button>
        </div>
        <div className="grid grid-cols-3 gap-2.5 mb-6">
          {categories.map(c => {
            const I = c.icon;
            return (
              <button key={c.label} onClick={() => onNav("aiSearch")} className="flex flex-col items-center gap-2 rounded-2xl py-4 transition-all hover:scale-105" style={{ background: c.bg }}>
                <I className="w-6 h-6" style={{ color: c.color }} />
                <span className="text-xs font-semibold" style={{ color: c.color }}>{c.label}</span>
              </button>
            );
          })}
        </div>
        <div className="mb-4 rounded-2xl overflow-hidden relative h-28">
          <img src="https://images.unsplash.com/photo-1621905251918-48416bd8575a?w=400&h=120&fit=crop&auto=format" alt="Promotion" className="w-full h-full object-cover" />
          <div className="absolute inset-0 bg-gradient-to-r from-primary/90 to-transparent flex items-center px-5">
            <div>
              <div className="text-white/80 text-[10px] font-medium uppercase tracking-wide mb-0.5">First booking</div>
              <div className="text-white text-lg font-bold leading-tight" style={{ fontFamily: "Plus Jakarta Sans, sans-serif" }}>20% off<br/><span className="text-sm font-medium">with code FIRST20</span></div>
            </div>
          </div>
          <div className="absolute right-4 top-1/2 -translate-y-1/2">
            <Pill color="gold" sm>Offer</Pill>
          </div>
        </div>
        <div className="flex items-center justify-between mb-3 mt-5">
          <h3 className="font-bold text-foreground" style={{ fontFamily: "Plus Jakarta Sans, sans-serif" }}>Featured Near You</h3>
          <button className="text-xs text-primary font-medium">View all</button>
        </div>
        <div className="space-y-3">
          {providers.map(p => (
            <ProviderCard key={p.id} p={p} onPress={() => onNav("providerProfile")} showWhy />
          ))}
        </div>
        <div className="mt-5 mb-3">
          <h3 className="font-bold text-foreground mb-3" style={{ fontFamily: "Plus Jakarta Sans, sans-serif" }}>Popular Now</h3>
          <div className="flex gap-2 overflow-x-auto pb-1" style={{ scrollbarWidth: "none" }}>
            {["Deep Clean", "Boiler Service", "Garden Tidy", "Furniture Assembly", "Laptop Repair"].map(s => (
              <button key={s} onClick={() => onNav("aiSearch")} className="shrink-0 bg-card border border-border rounded-full px-4 py-2 text-sm font-medium text-foreground hover:border-primary hover:text-primary transition-colors">
                {s}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
    <BottomNav active="home" onNav={onNav} />
  </div>
);

const AISearchScreen = ({ onNav }: { onNav: (s: ScreenId) => void }) => {
  const [query] = useState("house cleaning");
  const [showFilters, setShowFilters] = useState(false);
  return (
    <div className="flex flex-col h-full bg-background overflow-hidden">
      <div style={{ background: "linear-gradient(160deg, #0D3270 0%, #1565C0 100%)" }}>
        <StatusBar dark />
        <div className="px-4 pb-4">
          <div className="flex items-center gap-3 mb-3">
            <button onClick={() => onNav("customerHome")} className="w-9 h-9 rounded-full bg-white/15 flex items-center justify-center">
              <ArrowLeft className="w-4 h-4 text-white" />
            </button>
            <div className="flex-1 bg-white rounded-2xl flex items-center gap-2 px-4 py-2.5">
              <Zap className="w-4 h-4 text-primary" />
              <span className="text-sm text-foreground font-medium">{query}</span>
            </div>
            <button onClick={() => setShowFilters(true)} className="w-9 h-9 rounded-full bg-white/15 flex items-center justify-center">
              <Sliders className="w-4 h-4 text-white" />
            </button>
          </div>
          <div className="flex gap-2 overflow-x-auto pb-1" style={{ scrollbarWidth: "none" }}>
            {["⭐ 4.5+", "📍 <2mi", "✅ Verified", "💰 <$60/hr", "📅 Today"].map(f => (
              <button key={f} className="shrink-0 bg-white/20 text-white text-xs font-medium px-3 py-1.5 rounded-full">{f}</button>
            ))}
          </div>
        </div>
      </div>
      <div className="flex items-center gap-2 px-4 py-3 bg-primary/5 border-b border-border">
        <Zap className="w-4 h-4 text-primary" />
        <p className="text-xs text-primary font-medium">AI found <strong>24 matches</strong> based on your location and preferences</p>
      </div>
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3 pb-4" style={{ scrollbarWidth: "none" }}>
        {providers.map(p => (
          <ProviderCard key={p.id} p={p} onPress={() => onNav("providerProfile")} showWhy />
        ))}
        <div className="py-6 flex flex-col items-center gap-3 text-center">
          <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
            <RefreshCw className="w-5 h-5 text-primary" />
          </div>
          <p className="text-sm text-muted-foreground">Showing top 3 of 24 results</p>
          <Btn variant="outline" sm onClick={() => setShowFilters(true)}>
            <Filter className="w-4 h-4" /> Adjust Filters
          </Btn>
        </div>
      </div>
      {showFilters && (
        <div className="absolute inset-0 z-30" onClick={() => setShowFilters(false)}>
          <div className="absolute inset-0 bg-black/40" />
          <div className="absolute bottom-0 left-0 right-0 bg-card rounded-t-3xl p-6 max-h-[80%] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="w-10 h-1 bg-border rounded-full mx-auto mb-5" />
            <h2 className="text-lg font-bold text-foreground mb-5" style={{ fontFamily: "Plus Jakarta Sans, sans-serif" }}>Refine Results</h2>
            <div className="space-y-5">
              {["Budget (per hour)", "Distance", "Minimum Rating", "Availability"].map(f => (
                <div key={f}>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-semibold text-foreground">{f}</span>
                    <span className="text-sm text-primary font-medium">Any</span>
                  </div>
                  <div className="h-1.5 bg-muted rounded-full"><div className="h-full w-2/3 bg-primary rounded-full" /></div>
                </div>
              ))}
              <div>
                <div className="text-sm font-semibold text-foreground mb-2">Verification Status</div>
                <div className="flex gap-2">
                  {["All", "Verified Only", "Background Checked"].map(v => (
                    <button key={v} className={`text-xs font-medium px-3 py-1.5 rounded-full ${v === "Verified Only" ? "bg-primary text-white" : "bg-background border border-border text-foreground"}`}>{v}</button>
                  ))}
                </div>
              </div>
            </div>
            <div className="mt-6 flex gap-3">
              <Btn variant="outline" full sm>Reset</Btn>
              <Btn variant="primary" full sm onClick={() => setShowFilters(false)}>Apply Filters</Btn>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

const ProviderProfileScreen = ({ onNav }: { onNav: (s: ScreenId) => void }) => {
  const p = providers[0];
  const { userRole } = React.useContext(AuthContext);
  const { push } = React.useContext(ToastContext);
  const isOwner = userRole === "provider-individual" || userRole === "provider-business";
  const [tab, setTab] = useState<"services"|"gallery"|"reviews">("services");
  const [saved, setSaved] = useState(false);
  const [avatar, setAvatar] = useState(p.avatar);
  const [coverImg, setCoverImg] = useState(p.coverImg);
  const [editingAvatar, setEditingAvatar] = useState(false);
  const [editingCover, setEditingCover] = useState(false);

  return (
    <div className="flex flex-col h-full bg-background overflow-hidden relative">
      {editingAvatar && (
        <PhotoPickerSheet
          label="Update Profile Photo"
          onClose={() => setEditingAvatar(false)}
          onPick={url => { setAvatar(url); setEditingAvatar(false); push({ title: "Profile photo updated", body: "Your new photo is live", icon: CheckCircle, color: "text-green-600", bg: "bg-green-50" }); }}
        />
      )}
      {editingCover && (
        <PhotoPickerSheet
          label="Update Cover Photo"
          onClose={() => setEditingCover(false)}
          onPick={url => { setCoverImg(url); setEditingCover(false); push({ title: "Cover photo updated", body: "Your cover image is live", icon: CheckCircle, color: "text-green-600", bg: "bg-green-50" }); }}
        />
      )}
      {/* Floating controls */}
      <div className="absolute top-0 left-0 right-0 z-20 pointer-events-none">
        <StatusBar dark />
        <div className="flex items-center justify-between px-4 pt-1 pb-8 bg-gradient-to-b from-black/40 to-transparent pointer-events-auto">
          <button onClick={() => onNav("aiSearch")} className="w-9 h-9 rounded-full bg-black/35 backdrop-blur-sm flex items-center justify-center">
            <ArrowLeft className="w-4 h-4 text-white" />
          </button>
          <div className="flex gap-2">
            {isOwner && (
              <button onClick={() => setEditingCover(true)} className="w-9 h-9 rounded-full bg-black/35 backdrop-blur-sm flex items-center justify-center">
                <ImagePlus className="w-4 h-4 text-white" />
              </button>
            )}
            <button onClick={() => setSaved(!saved)} className="w-9 h-9 rounded-full bg-black/35 backdrop-blur-sm flex items-center justify-center">
              <Heart className={`w-4 h-4 ${saved ? "fill-rose-400 text-rose-400" : "text-white"}`} />
            </button>
            <button className="w-9 h-9 rounded-full bg-black/35 backdrop-blur-sm flex items-center justify-center">
              <Share2 className="w-4 h-4 text-white" />
            </button>
          </div>
        </div>
      </div>
      {/* Scroll area */}
      <div className="flex-1 overflow-y-auto" style={{ scrollbarWidth: "none" }}>
        <div className="h-56 bg-slate-200 relative">
          <img src={coverImg} alt="Cover" className="w-full h-full object-cover" />
          <div className="absolute inset-0 bg-gradient-to-t from-black/30 to-transparent" />
          {isOwner && (
            <button onClick={() => setEditingCover(true)} className="absolute bottom-3 right-3 flex items-center gap-1.5 bg-black/50 text-white text-[10px] font-semibold rounded-full px-3 py-1.5 backdrop-blur-sm border border-white/20">
              <Pencil className="w-3 h-3" /> Edit cover
            </button>
          )}
        </div>
        <div className="px-5 -mt-10 relative z-10 pb-4">
          <div className="flex items-end gap-4 mb-4">
            <div className="relative">
              <img src={avatar} alt={p.name} className="w-20 h-20 rounded-2xl object-cover border-4 border-card shadow-xl" />
              {isOwner && (
                <button onClick={() => setEditingAvatar(true)} className="absolute -bottom-1 -right-1 w-7 h-7 bg-primary rounded-full flex items-center justify-center border-2 border-card shadow">
                  <Pencil className="w-3 h-3 text-white" />
                </button>
              )}
              {!isOwner && p.verified && (
                <div className="absolute -bottom-1 -right-1 w-7 h-7 bg-blue-500 rounded-full flex items-center justify-center border-2 border-card">
                  <Check className="w-3.5 h-3.5 text-white" />
                </div>
              )}
            </div>
            <div className="flex-1 pt-10">
              <div className="flex items-center gap-1.5 mb-0.5">
                <h1 className="text-xl font-bold text-foreground" style={{ fontFamily: "Plus Jakarta Sans, sans-serif" }}>{p.name}</h1>
              </div>
              <p className="text-sm text-muted-foreground">{p.specialty}</p>
              <Pill color="gold" sm><Award className="w-2.5 h-2.5" />{p.badge}</Pill>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-2 mb-5">
            {[
              { label: "Jobs Done", value: p.completedJobs },
              { label: "Rating", value: `${p.rating}★` },
              { label: "Response", value: p.responseTime },
            ].map(s => (
              <div key={s.label} className="bg-card rounded-2xl py-3 text-center shadow-sm border border-border/40">
                <div className="text-lg font-bold text-foreground" style={{ fontFamily: "Plus Jakarta Sans, sans-serif" }}>{s.value}</div>
                <div className="text-[10px] text-muted-foreground font-medium">{s.label}</div>
              </div>
            ))}
          </div>
          <p className="text-sm text-muted-foreground leading-relaxed mb-4">{p.bio}</p>
          <div className="flex flex-wrap gap-1.5 mb-5">
            {p.skills.map(s => <Pill key={s} color="blue" sm>{s}</Pill>)}
            <Pill color="green" sm><CheckCircle className="w-2.5 h-2.5" />Insured</Pill>
            <Pill color="green" sm><Shield className="w-2.5 h-2.5" />Background Check</Pill>
          </div>
          <div className="flex gap-1.5 mb-5 border-b border-border">
            {(["services", "gallery", "reviews"] as const).map(t => (
              <button key={t} onClick={() => setTab(t)} className={`px-4 py-2 text-sm font-semibold capitalize border-b-2 transition-colors ${tab === t ? "border-primary text-primary" : "border-transparent text-muted-foreground"}`}>
                {t}
              </button>
            ))}
          </div>
          {tab === "services" && (
            <div className="space-y-3">
              {[
                { title: "Regular Clean", desc: "Weekly or bi-weekly recurring visits", price: "$45/hr", dur: "2–3 hrs" },
                { title: "Deep Clean", desc: "Full top-to-bottom intensive clean", price: "$120 flat", dur: "4–5 hrs" },
                { title: "Move-Out Clean", desc: "End-of-tenancy, deposit-back ready", price: "$180 flat", dur: "5–6 hrs" },
              ].map(svc => (
                <button key={svc.title} onClick={() => onNav("serviceDetail")} className="w-full bg-card rounded-2xl p-4 shadow-sm border border-border/40 text-left flex items-center gap-3 hover:shadow-md transition-shadow">
                  <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
                    <Package className="w-5 h-5 text-primary" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-semibold text-sm text-foreground">{svc.title}</div>
                    <div className="text-xs text-muted-foreground">{svc.desc}</div>
                    <div className="text-xs text-muted-foreground mt-0.5"><Clock className="w-3 h-3 inline mr-0.5" />{svc.dur}</div>
                  </div>
                  <div className="text-right">
                    <div className="font-bold text-sm text-foreground">{svc.price}</div>
                    <ChevronRight className="w-4 h-4 text-muted-foreground ml-auto mt-1" />
                  </div>
                </button>
              ))}
            </div>
          )}
          {tab === "gallery" && (
            <div className="grid grid-cols-3 gap-1.5">
              {[
                "https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=150&h=150&fit=crop&auto=format",
                "https://images.unsplash.com/photo-1600585154340-be6161a56a0c?w=150&h=150&fit=crop&auto=format",
                "https://images.unsplash.com/photo-1556909114-f6e7ad7d3136?w=150&h=150&fit=crop&auto=format",
                "https://images.unsplash.com/photo-1604709177225-055f99402ea3?w=150&h=150&fit=crop&auto=format",
                "https://images.unsplash.com/photo-1584622650111-993a426fbf0a?w=150&h=150&fit=crop&auto=format",
                "https://images.unsplash.com/photo-1563453392212-326f5e854473?w=150&h=150&fit=crop&auto=format",
              ].map((url, i) => (
                <div key={i} className="aspect-square rounded-xl overflow-hidden bg-slate-100">
                  <img src={url} alt={`Gallery ${i}`} className="w-full h-full object-cover" />
                </div>
              ))}
            </div>
          )}
          {tab === "reviews" && (
            <div className="space-y-3">
              {[
                { name: "Jordan T.", date: "2 days ago", rating: 5, text: "Sarah was absolutely fantastic. Left my apartment spotless — even cleaned places I forgot to mention." },
                { name: "Maya R.", date: "1 week ago", rating: 5, text: "Punctual, thorough, and super friendly. Highly recommend for move-out cleans." },
                { name: "Chris L.", date: "2 weeks ago", rating: 4, text: "Great job overall. Communication was excellent. Will book again." },
              ].map(r => (
                <div key={r.name} className="bg-card rounded-2xl p-4 shadow-sm border border-border/40">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-xs font-bold text-primary">{r.name[0]}</div>
                      <div>
                        <div className="text-sm font-semibold text-foreground">{r.name}</div>
                        <div className="text-[10px] text-muted-foreground">{r.date}</div>
                      </div>
                    </div>
                    <Stars v={r.rating} size={11} />
                  </div>
                  <p className="text-xs text-muted-foreground leading-relaxed">{r.text}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
      {/* Fixed CTA bar */}
      <div className="shrink-0 bg-card border-t border-border p-4 flex gap-3">
        <Btn variant="outline" onClick={() => onNav("chat")} className="flex-1"><MessageSquare className="w-4 h-4" /> Message</Btn>
        <Btn variant="accent" onClick={() => onNav("serviceDetail")} className="flex-2 px-8">Book Now</Btn>
      </div>
    </div>
  );
};

const ServiceDetailScreen = ({ onNav }: { onNav: (s: ScreenId) => void }) => {
  const p = providers[0];
  const [selectedDay, setSelectedDay] = useState(14);
  const days = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  return (
    <div className="flex flex-col h-full bg-background overflow-hidden relative">
      {/* Floating back button overlays scroll area */}
      <div className="absolute top-0 left-0 right-0 z-20 pointer-events-none">
        <StatusBar dark />
        <div className="px-4 pt-1 pb-8 bg-gradient-to-b from-black/40 to-transparent pointer-events-auto w-fit">
          <button onClick={() => onNav("providerProfile")} className="w-9 h-9 rounded-full bg-black/35 backdrop-blur-sm flex items-center justify-center">
            <ArrowLeft className="w-4 h-4 text-white" />
          </button>
        </div>
      </div>
      {/* Scroll area: cover scrolls with content */}
      <div className="flex-1 overflow-y-auto" style={{ scrollbarWidth: "none" }}>
        <div className="h-48 bg-slate-200 relative">
          <img src={p.coverImg} alt="Service" className="w-full h-full object-cover" />
          <div className="absolute inset-0 bg-gradient-to-t from-black/40 to-transparent" />
        </div>
        <div className="px-5 py-5 space-y-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <Pill color="blue" sm>House Cleaning</Pill>
              <h1 className="text-xl font-bold text-foreground mt-2" style={{ fontFamily: "Plus Jakarta Sans, sans-serif" }}>Deep Clean Package</h1>
              <p className="text-muted-foreground text-sm mt-0.5">Full top-to-bottom intensive clean. All rooms, kitchen, bathrooms, and hidden areas.</p>
            </div>
            <div className="text-right shrink-0">
              <div className="text-2xl font-extrabold text-foreground" style={{ fontFamily: "Plus Jakarta Sans, sans-serif" }}>$120</div>
              <div className="text-xs text-muted-foreground">flat rate</div>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-2">
            {[{ icon: Clock, label: "Duration", val: "4–5 hrs" }, { icon: Users, label: "Cleaners", val: "1 pro" }, { icon: Shield, label: "Insured", val: "Yes" }].map(s => (
              <div key={s.label} className="bg-card rounded-xl p-3 text-center border border-border/40">
                <s.icon className="w-4 h-4 text-primary mx-auto mb-1" />
                <div className="text-xs text-muted-foreground">{s.label}</div>
                <div className="text-sm font-semibold text-foreground">{s.val}</div>
              </div>
            ))}
          </div>
          <div className="bg-card rounded-2xl p-4 border border-border/40">
            <h3 className="font-semibold text-foreground mb-3 text-sm" style={{ fontFamily: "Plus Jakarta Sans, sans-serif" }}>{"What's included"}</h3>
            <div className="space-y-2">
              {["All rooms vacuumed & mopped", "Kitchen including oven & hob", "Bathrooms scrubbed & disinfected", "Skirting boards & light switches", "Inside cupboards on request", "Eco-friendly products available"].map(item => (
                <div key={item} className="flex items-center gap-2.5 text-sm text-muted-foreground">
                  <div className="w-4 h-4 rounded-full bg-green-100 flex items-center justify-center shrink-0">
                    <Check className="w-2.5 h-2.5 text-green-600" />
                  </div>
                  {item}
                </div>
              ))}
            </div>
          </div>
          <div className="bg-card rounded-2xl p-4 border border-border/40">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-semibold text-foreground text-sm" style={{ fontFamily: "Plus Jakarta Sans, sans-serif" }}>Availability</h3>
              <span className="text-xs text-muted-foreground">March 2025</span>
            </div>
            <div className="grid grid-cols-7 gap-1 mb-3">
              {days.map((d, i) => (
                <div key={d} className="text-center">
                  <div className="text-[9px] text-muted-foreground mb-1">{d}</div>
                  <button onClick={() => setSelectedDay(10 + i)} className={`w-full aspect-square rounded-full text-xs font-medium transition-all ${selectedDay === 10 + i ? "bg-primary text-white" : [11, 14].includes(10 + i) ? "text-muted-foreground/40 cursor-not-allowed" : "hover:bg-primary/10 text-foreground"}`}>
                    {10 + i}
                  </button>
                </div>
              ))}
            </div>
            <div className="flex gap-2 overflow-x-auto" style={{ scrollbarWidth: "none" }}>
              {["9:00 AM", "11:00 AM", "1:00 PM", "3:00 PM"].map(t => (
                <button key={t} className={`shrink-0 text-xs font-medium px-3 py-1.5 rounded-full border ${t === "11:00 AM" ? "bg-primary text-white border-primary" : "border-border text-foreground"}`}>{t}</button>
              ))}
            </div>
          </div>
          <div className="bg-amber-50 rounded-2xl p-4 border border-amber-100">
            <div className="flex items-start gap-2">
              <Info className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
              <div>
                <p className="text-xs font-semibold text-amber-800">Cancellation Policy</p>
                <p className="text-xs text-amber-700 mt-0.5 leading-relaxed">Free cancellation up to 24 hours before. After that, a 50% fee applies.</p>
              </div>
            </div>
          </div>
          <div className="bg-card rounded-2xl p-4 border border-border/40">
            <div className="flex items-center gap-3">
              <img src={p.avatar} alt={p.name} className="w-10 h-10 rounded-full object-cover" />
              <div className="flex-1">
                <div className="font-semibold text-sm text-foreground">{p.name}</div>
                <Stars v={p.rating} size={11} />
              </div>
              <button onClick={() => onNav("providerProfile")} className="text-xs text-primary font-medium">View profile</button>
            </div>
          </div>
        </div>
      </div>
      <div className="shrink-0 bg-card border-t border-border p-4">
        <div className="flex items-center justify-between mb-3">
          <span className="text-sm text-muted-foreground">Total</span>
          <span className="text-xl font-bold text-foreground" style={{ fontFamily: "Plus Jakarta Sans, sans-serif" }}>$120.00</span>
        </div>
        <Btn variant="accent" full onClick={() => onNav("bookingRequest")}>
          Book This Service <ArrowRight className="w-4 h-4" />
        </Btn>
      </div>
    </div>
  );
};

const SAMPLE_JOB_PHOTOS = [
  "https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=200&h=200&fit=crop&auto=format",
  "https://images.unsplash.com/photo-1600585154340-be6161a56a0c?w=200&h=200&fit=crop&auto=format",
  "https://images.unsplash.com/photo-1556909114-f6e7ad7d3136?w=200&h=200&fit=crop&auto=format",
];

const BookingRequestScreen = ({ onNav }: { onNav: (s: ScreenId) => void }) => {
  const { push } = React.useContext(ToastContext);
  const { setQuoteStatus, setQuotePhotos } = React.useContext(QuoteContext);
  const [mode, setMode] = useState<"book"|"quote">("book");
  const [photos, setPhotos] = useState<string[]>([]);
  const [showPhotoSheet, setShowPhotoSheet] = useState(false);

  const samplePhotos = SAMPLE_JOB_PHOTOS;

  const handleAddPhoto = (url: string) => {
    setPhotos(prev => [...prev, url]);
    setShowPhotoSheet(false);
  };

  const handleSubmitQuote = () => {
    setQuotePhotos(photos.length > 0 ? photos : samplePhotos);
    setQuoteStatus("waiting");
    push({
      title: "Quote request sent!",
      body: "Sarah Chen received your photos and will send an estimate shortly.",
      icon: Camera, color: "text-primary", bg: "bg-blue-50",
      screen: "quoteWaiting",
    });
    onNav("quoteWaiting");
  };

  return (
    <div className="flex flex-col h-full bg-background overflow-hidden relative">
      {showPhotoSheet && (
        <PhotoPickerSheet
          label="Add Job Photo"
          onClose={() => setShowPhotoSheet(false)}
          onPick={handleAddPhoto}
        />
      )}
      <StatusBar />
      <BackHeader title="Book Service" onBack={() => onNav("serviceDetail")} />

      {/* Mode toggle */}
      <div className="px-5 pt-3 pb-0">
        <div className="flex gap-1 bg-background rounded-xl p-1 border border-border">
          {([
            { id: "book", label: "Book at fixed price", icon: Lock },
            { id: "quote", label: "Request a quote", icon: Camera },
          ] as const).map(opt => {
            const I = opt.icon;
            return (
              <button
                key={opt.id}
                onClick={() => setMode(opt.id)}
                className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-lg text-xs font-semibold transition-all ${mode === opt.id ? "bg-primary text-white shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
              >
                <I className="w-3.5 h-3.5" /> {opt.label}
              </button>
            );
          })}
        </div>
        {mode === "quote" && (
          <div className="mt-2 flex items-center gap-2 bg-amber-50 border border-amber-100 rounded-xl px-3 py-2">
            <Info className="w-3.5 h-3.5 text-amber-600 shrink-0" />
            <p className="text-xs text-amber-700 leading-snug">Upload photos of the job and get a custom estimate from Sarah before committing.</p>
          </div>
        )}
      </div>

      <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4" style={{ scrollbarWidth: "none" }}>
        <div className="bg-primary/5 rounded-2xl p-4 border border-primary/10 flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center"><Package className="w-5 h-5 text-primary" /></div>
          <div>
            <div className="font-semibold text-sm text-foreground">Deep Clean Package</div>
            <div className="text-xs text-muted-foreground">Sarah Chen · {mode === "book" ? "$120 flat" : "price on request"}</div>
          </div>
          <Pill color={mode === "book" ? "blue" : "orange"} sm>{mode === "book" ? "4–5 hrs" : "Quote"}</Pill>
        </div>

        {/* Photo upload — prominent in quote mode */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
              {mode === "quote" ? "Job Photos (required for quote)" : '"Before" Photos (optional)'}
            </div>
            {photos.length > 0 && <span className="text-xs text-primary font-medium">{photos.length} added</span>}
          </div>
          {photos.length > 0 && (
            <div className="flex gap-2 mb-2 overflow-x-auto" style={{ scrollbarWidth: "none" }}>
              {photos.map((url, i) => (
                <div key={i} className="relative shrink-0">
                  <div className="w-20 h-20 rounded-xl overflow-hidden">
                    <img src={url} alt="" className="w-full h-full object-cover" />
                  </div>
                  <button
                    onClick={() => setPhotos(prev => prev.filter((_, j) => j !== i))}
                    className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-destructive text-white flex items-center justify-center"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </div>
              ))}
              <button
                onClick={() => setShowPhotoSheet(true)}
                className="w-20 h-20 rounded-xl border-2 border-dashed border-border flex items-center justify-center shrink-0 bg-background hover:border-primary transition-colors"
              >
                <Plus className="w-5 h-5 text-muted-foreground" />
              </button>
            </div>
          )}
          {photos.length === 0 && (
            <button
              onClick={() => setShowPhotoSheet(true)}
              className={`w-full border-2 border-dashed rounded-2xl p-5 flex flex-col items-center gap-2 transition-all ${mode === "quote" ? "border-accent bg-amber-50/40 hover:border-accent/70" : "border-border bg-card hover:border-primary"}`}
            >
              <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${mode === "quote" ? "bg-accent/10" : "bg-primary/10"}`}>
                <Camera className={`w-6 h-6 ${mode === "quote" ? "text-accent" : "text-primary"}`} />
              </div>
              <div className="text-center">
                <div className="text-sm font-semibold text-foreground">Add photos of the job</div>
                <div className="text-xs text-muted-foreground">Tap to upload or take a photo</div>
              </div>
            </button>
          )}
        </div>

        <div>
          <div className="text-xs font-semibold text-muted-foreground mb-2 uppercase tracking-wide">Select Date</div>
          <div className="bg-card rounded-2xl p-4 border border-border/40">
            <div className="grid grid-cols-7 gap-1">
              {["M","T","W","T","F","S","S"].map((d, i) => <div key={i} className="text-center text-[9px] text-muted-foreground font-medium py-1">{d}</div>)}
              {Array.from({length:31},(_,i)=>i+1).map(d=>(
                <button key={d} className={`aspect-square rounded-full text-xs font-medium transition-all ${d===14?"bg-primary text-white":d===8||d===2?"opacity-30 cursor-not-allowed text-muted-foreground":"hover:bg-primary/10 text-foreground"}`}>{d}</button>
              ))}
            </div>
          </div>
        </div>

        <div>
          <div className="text-xs font-semibold text-muted-foreground mb-2 uppercase tracking-wide">Preferred Time</div>
          <div className="grid grid-cols-4 gap-2">
            {["8 AM","9 AM","10 AM","11 AM","12 PM","1 PM","2 PM","3 PM"].map(t=>(
              <button key={t} className={`py-2 rounded-xl text-xs font-medium border transition-all ${t==="11 AM"?"bg-primary text-white border-primary":"border-border text-foreground hover:border-primary"}`}>{t}</button>
            ))}
          </div>
        </div>

        <Input2 label="Service Address" placeholder="123 Oak Street, San Francisco, CA" icon={MapPin} />

        <div>
          <div className="text-xs font-semibold text-muted-foreground mb-2 uppercase tracking-wide">
            {mode === "quote" ? "Describe the job" : "Notes for Provider (optional)"}
          </div>
          <div className="bg-background border border-border rounded-xl px-4 py-3">
            <textarea
              placeholder={mode === "quote" ? "e.g. 3-bed flat, kitchen needs extra attention, some mould in bathroom..." : "e.g. Focus on kitchen and bathrooms. Dog-friendly home."}
              rows={3}
              className="w-full text-sm bg-transparent outline-none text-foreground placeholder:text-muted-foreground resize-none"
            />
          </div>
        </div>

        {mode === "book" && (
          <div className="bg-card rounded-2xl p-4 border border-border/40 space-y-2">
            <div className="flex justify-between text-sm"><span className="text-muted-foreground">Service fee</span><span className="font-medium">$120.00</span></div>
            <div className="flex justify-between text-sm"><span className="text-muted-foreground">Platform fee</span><span className="font-medium">$9.00</span></div>
            <div className="flex justify-between text-sm text-green-600"><span>Promo FIRST20</span><span>–$24.00</span></div>
            <div className="h-px bg-border my-1" />
            <div className="flex justify-between font-bold"><span>Total</span><span>$105.00</span></div>
          </div>
        )}

        {mode === "quote" && (
          <div className="bg-card rounded-2xl p-4 border border-border/40 space-y-1.5 text-sm">
            <div className="flex items-center gap-2 text-muted-foreground mb-2">
              <Info className="w-4 h-4 text-primary shrink-0" />
              <span className="text-xs font-medium text-foreground">How quote pricing works</span>
            </div>
            {["Sarah reviews your photos & description", "She sends back a price estimate", "You approve or decline before any charge", "Payment held in escrow once accepted"].map((step, i) => (
              <div key={i} className="flex items-start gap-2">
                <div className="w-4 h-4 rounded-full bg-primary/10 flex items-center justify-center shrink-0 mt-0.5">
                  <span className="text-[9px] font-bold text-primary">{i+1}</span>
                </div>
                <span className="text-xs text-muted-foreground">{step}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="shrink-0 bg-card border-t border-border p-4">
        {mode === "book" ? (
          <Btn variant="accent" full onClick={() => onNav("payment")}>
            <Lock className="w-4 h-4" /> Continue to Payment
          </Btn>
        ) : (
          <Btn variant="accent" full onClick={handleSubmitQuote}>
            <Camera className="w-4 h-4" /> Send Quote Request
          </Btn>
        )}
      </div>
    </div>
  );
};

const PaymentScreen = ({ onNav }: { onNav: (s: ScreenId) => void }) => {
  const [method, setMethod] = useState<"card"|"wallet">("card");
  return (
    <div className="flex flex-col h-full bg-background overflow-hidden">
      <StatusBar />
      <BackHeader title="Secure Payment" onBack={() => onNav("bookingRequest")} />
      <div className="flex-1 overflow-y-auto px-5 pb-4 space-y-4" style={{ scrollbarWidth: "none" }}>
        <div className="bg-primary/5 border border-primary/10 rounded-2xl p-4 flex items-start gap-3">
          <div className="w-10 h-10 rounded-xl bg-primary flex items-center justify-center shrink-0"><Lock className="w-5 h-5 text-white" /></div>
          <div>
            <div className="font-semibold text-sm text-foreground flex items-center gap-1.5">Escrow Payment <Pill color="green" sm>How it works</Pill></div>
            <p className="text-xs text-muted-foreground mt-1 leading-relaxed">Your payment is held securely and only released to Sarah once {"you've"} confirmed the job is complete. You can dispute within 48 hours.</p>
          </div>
        </div>
        <div className="bg-card rounded-2xl p-4 border border-border/40">
          <div className="flex gap-2 mb-4 bg-background rounded-xl p-1">
            {(["card", "wallet"] as const).map(m => (
              <button key={m} onClick={() => setMethod(m)} className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-lg text-sm font-semibold transition-all ${method===m?"bg-primary text-white shadow-sm":"text-muted-foreground"}`}>
                {m === "card" ? <CreditCard className="w-4 h-4" /> : <Wallet className="w-4 h-4" />}
                {m === "card" ? "Card" : "Wallet"}
              </button>
            ))}
          </div>
          {method === "card" ? (
            <div className="space-y-3">
              <Input2 label="Card Number" placeholder="1234  5678  9012  3456" icon={CreditCard} />
              <div className="grid grid-cols-2 gap-3">
                <Input2 label="Expiry" placeholder="MM / YY" />
                <Input2 label="CVV" placeholder="•••" icon={Lock} />
              </div>
              <Input2 label="Name on Card" placeholder="Jane Smith" icon={User} />
              <div className="flex items-center gap-2">
                <div className="w-5 h-5 rounded-md bg-primary flex items-center justify-center shrink-0"><Check className="w-3 h-3 text-white" /></div>
                <span className="text-xs text-muted-foreground">Save card for future bookings</span>
              </div>
            </div>
          ) : (
            <div className="flex flex-col items-center py-6 gap-3">
              <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center"><Wallet className="w-8 h-8 text-primary" /></div>
              <div className="text-center">
                <div className="font-bold text-foreground">EverySkill Wallet</div>
                <div className="text-2xl font-extrabold text-primary mt-1" style={{ fontFamily: "Plus Jakarta Sans, sans-serif" }}>$320.00</div>
                <div className="text-xs text-muted-foreground">Available balance</div>
              </div>
            </div>
          )}
        </div>
        <div className="bg-card rounded-2xl p-4 border border-border/40 space-y-2">
          <h3 className="font-semibold text-sm text-foreground mb-2" style={{ fontFamily: "Plus Jakarta Sans, sans-serif" }}>Order Summary</h3>
          <div className="flex justify-between text-sm"><span className="text-muted-foreground">Deep Clean Package</span><span>$120.00</span></div>
          <div className="flex justify-between text-sm"><span className="text-muted-foreground">Platform fee</span><span>$9.00</span></div>
          <div className="flex justify-between text-sm text-green-600"><span>Promo FIRST20</span><span>–$24.00</span></div>
          <div className="h-px bg-border" />
          <div className="flex justify-between font-bold text-base"><span>Total (Escrow)</span><span>$105.00</span></div>
        </div>
        <div className="flex items-center justify-center gap-3 py-1">
          {["SSL Encrypted", "PCI Compliant", "256-bit Secure"].map(s => (
            <div key={s} className="flex items-center gap-1 text-[10px] text-muted-foreground">
              <Shield className="w-3 h-3 text-green-500" />{s}
            </div>
          ))}
        </div>
      </div>
      <div className="shrink-0 bg-card border-t border-border p-4">
        <Btn variant="accent" full onClick={() => onNav("bookingConfirmation")}>
          <Lock className="w-4 h-4" /> Pay $105.00 (Escrow)
        </Btn>
      </div>
    </div>
  );
};

const BookingConfirmationScreen = ({ onNav }: { onNav: (s: ScreenId) => void }) => {
  const { push } = React.useContext(ToastContext);
  const { quoteStatus } = React.useContext(QuoteContext);
  React.useEffect(() => {
    const t = setTimeout(() => {
      push({ title: "Payment received!", body: "Sarah has been notified and will confirm shortly.", icon: CheckCircle, color: "text-green-600", bg: "bg-green-50" });
    }, 1200);
    return () => clearTimeout(t);
  }, []);
  const steps = ["Requested", "Accepted", "Escrow", "In Progress", "Complete"];
  const currentStep = 2;
  return (
    <div className="flex flex-col h-full bg-background">
      <StatusBar />
      <div className="flex-1 overflow-y-auto px-5 py-6 pb-24" style={{ scrollbarWidth: "none" }}>
        <div className="flex flex-col items-center mb-8">
          <div className="w-24 h-24 rounded-full bg-green-50 flex items-center justify-center mb-4 shadow-lg shadow-green-100">
            <div className="w-16 h-16 rounded-full bg-green-100 flex items-center justify-center">
              <CheckCircle className="w-10 h-10 text-green-500" />
            </div>
          </div>
          <Pill color="green"><CheckCircle className="w-3 h-3" />Payment Secured</Pill>
          <h1 className="text-2xl font-bold text-foreground mt-3 text-center" style={{ fontFamily: "Plus Jakarta Sans, sans-serif" }}>
            {"You're all set!"}
          </h1>
          <p className="text-muted-foreground text-sm text-center mt-1">Sarah will confirm within 2 hours. {"You'll"} get a notification.</p>
        </div>
        <div className="bg-card rounded-2xl p-5 border border-border/40 mb-5">
          <h3 className="font-semibold text-sm text-foreground mb-4 text-center" style={{ fontFamily: "Plus Jakarta Sans, sans-serif" }}>Booking Status</h3>
          <div className="relative">
            <div className="absolute left-[18px] top-2 bottom-2 w-0.5 bg-muted z-0" />
            <div className="space-y-4 relative z-10">
              {steps.map((s, i) => (
                <div key={s} className="flex items-center gap-4">
                  <div className={`w-9 h-9 rounded-full flex items-center justify-center shrink-0 border-2 transition-all ${i < currentStep ? "bg-primary border-primary" : i === currentStep ? "bg-primary border-primary" : "bg-card border-muted"}`}>
                    {i < currentStep ? <Check className="w-4 h-4 text-white" /> : i === currentStep ? <div className="w-2 h-2 rounded-full bg-white" /> : <div className="w-2 h-2 rounded-full bg-muted" />}
                  </div>
                  <div className="flex-1">
                    <div className={`text-sm font-semibold ${i <= currentStep ? "text-foreground" : "text-muted-foreground"}`}>{s}</div>
                    {i === currentStep && <div className="text-xs text-primary font-medium mt-0.5">Current status</div>}
                    {i === 2 && <div className="text-xs text-muted-foreground">$105 held safely</div>}
                  </div>
                  {i === currentStep && <Pill color="blue" sm>Active</Pill>}
                </div>
              ))}
            </div>
          </div>
        </div>
        <div className="bg-card rounded-2xl p-4 border border-border/40 mb-4 space-y-3">
          <div className="flex items-center gap-3">
            <img src={providers[0].avatar} alt="Sarah" className="w-10 h-10 rounded-full object-cover" />
            <div>
              <div className="font-semibold text-sm text-foreground">Sarah Chen</div>
              <Stars v={4.9} size={11} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2 text-xs">
            {[["Service", "Deep Clean"], ["Date", "Wed, 14 Mar"], ["Time", "11:00 AM"], ["Ref", "#ES-4829"]].map(([k,v]) => (
              <div key={k} className="bg-background rounded-xl px-3 py-2">
                <div className="text-muted-foreground">{k}</div>
                <div className="font-semibold text-foreground">{v}</div>
              </div>
            ))}
          </div>
        </div>
        <div className="space-y-2">
          <Btn variant="primary" full onClick={() => onNav("bookingDetail")}>View Booking Detail</Btn>
          <Btn variant="ghost" full onClick={() => onNav("chat")}>
            <MessageSquare className="w-4 h-4" /> Message Sarah
          </Btn>
        </div>
      </div>
    </div>
  );
};

const BookingDetailScreen = ({ onNav }: { onNav: (s: ScreenId) => void }) => {
  const { push } = React.useContext(ToastContext);
  const { userRole } = React.useContext(AuthContext);
  const { quoteStatus, quoteData, quotePhotos, setQuoteStatus } = React.useContext(QuoteContext);
  const isProvider = userRole === "provider-individual" || userRole === "provider-business";
  const steps = ["Requested", "Accepted", "Escrow", "In Progress", "Complete"];
  const [showQR, setShowQR] = useState(false);
  const [showScanner, setShowScanner] = useState(false);
  const [checkedIn, setCheckedIn] = useState(false);
  const [checkInTime, setCheckInTime] = useState<string | null>(null);

  const handleProviderCheckIn = () => {
    setShowQR(true);
    push({
      title: "Check-in code ready",
      body: "Show the QR code to your customer",
      icon: QrCode, color: "text-primary", bg: "bg-blue-50",
    });
  };

  const handleSuccessfulScan = () => {
    setShowScanner(false);
    setCheckedIn(true);
    const now = new Date();
    setCheckInTime(`${now.getHours()}:${String(now.getMinutes()).padStart(2, "0")}`);
    push({
      title: "Provider is on site!",
      body: "Sarah Chen checked in at your location",
      icon: Wifi, color: "text-green-600", bg: "bg-green-50",
      screen: "bookingDetail",
    });
  };

  return (
    <div className="flex flex-col h-full bg-background overflow-hidden relative">
      {showQR && <QRCodeDisplay bookingRef="ES-4829" onClose={() => setShowQR(false)} />}
      {showScanner && <QRScannerView onScanned={handleSuccessfulScan} onClose={() => setShowScanner(false)} />}
      <StatusBar />
      <BackHeader title="Booking #ES-4829" onBack={() => onNav(isProvider ? "bookingInbox" : "customerDashboard")} action={<MoreVertical className="w-4 h-4 text-foreground" />} />
      <div className="flex-1 overflow-y-auto px-5 pb-6 space-y-4" style={{ scrollbarWidth: "none" }}>

        {/* Quote card — shown when provider has sent a quote */}
        {quoteStatus === "quoted" && quoteData && !isProvider && (
          <div className="bg-card rounded-2xl border-2 border-accent/40 overflow-hidden shadow-sm">
            <div className="bg-accent/10 px-4 py-3 flex items-center gap-2">
              <DollarSign className="w-4 h-4 text-accent" />
              <span className="text-sm font-bold text-foreground" style={{ fontFamily: "Plus Jakarta Sans, sans-serif" }}>{"Provider's"} Quote Ready</span>
              <div className="w-2 h-2 rounded-full bg-accent animate-pulse ml-auto" />
            </div>
            <div className="p-4 space-y-3">
              {quotePhotos.length > 0 && (
                <div className="flex gap-2 overflow-x-auto" style={{ scrollbarWidth: "none" }}>
                  {quotePhotos.map((url, i) => (
                    <div key={i} className="w-16 h-16 rounded-xl overflow-hidden shrink-0">
                      <img src={url} alt="" className="w-full h-full object-cover" />
                    </div>
                  ))}
                </div>
              )}
              <div className="grid grid-cols-2 gap-2">
                <div className="bg-background rounded-xl px-3 py-2.5">
                  <div className="text-[10px] text-muted-foreground">Est. Duration</div>
                  <div className="font-bold text-foreground">{quoteData.duration}</div>
                </div>
                <div className="bg-background rounded-xl px-3 py-2.5">
                  <div className="text-[10px] text-muted-foreground">Final Price</div>
                  <div className="font-bold text-foreground text-lg" style={{ fontFamily: "Plus Jakarta Sans, sans-serif" }}>{quoteData.price}</div>
                </div>
              </div>
              {quoteData.note && (
                <div className="bg-background rounded-xl px-3 py-2.5">
                  <div className="text-[10px] text-muted-foreground mb-0.5">{"Provider's"} note</div>
                  <p className="text-xs text-foreground leading-relaxed">{quoteData.note}</p>
                </div>
              )}
              <div className="flex gap-2 pt-1">
                <button
                  onClick={() => {
                    setQuoteStatus("declined");
                    push({ title: "Quote declined", body: "Sarah Chen has been notified.", icon: X, color: "text-destructive", bg: "bg-red-50" });
                  }}
                  className="flex-1 flex items-center justify-center gap-1.5 bg-red-50 text-destructive text-sm font-semibold py-3 rounded-xl"
                >
                  <X className="w-4 h-4" /> Decline
                </button>
                <button
                  onClick={() => {
                    setQuoteStatus("accepted");
                    push({ title: "Quote accepted!", body: "Proceeding to payment.", icon: CheckCircle, color: "text-green-600", bg: "bg-green-50", screen: "payment" });
                    onNav("payment");
                  }}
                  className="flex-2 flex items-center justify-center gap-1.5 bg-primary text-white text-sm font-semibold px-6 py-3 rounded-xl"
                >
                  <Check className="w-4 h-4" /> Accept & Pay
                </button>
              </div>
            </div>
          </div>
        )}

        {quoteStatus === "waiting" && !isProvider && (
          <div className="flex items-center gap-3 bg-amber-50 border border-amber-200 rounded-2xl p-3.5">
            <div className="w-9 h-9 rounded-full bg-amber-100 flex items-center justify-center shrink-0">
              <Clock className="w-5 h-5 text-amber-600" />
            </div>
            <div>
              <div className="text-sm font-semibold text-amber-800">Waiting for estimate</div>
              <div className="text-xs text-amber-600">Sarah is reviewing your photos</div>
            </div>
          </div>
        )}

        {/* Check-in status banner */}
        {checkedIn && (
          <div className="flex items-center gap-3 bg-green-50 border border-green-200 rounded-2xl p-3.5">
            <div className="w-9 h-9 rounded-full bg-green-500 flex items-center justify-center shrink-0">
              <Wifi className="w-5 h-5 text-white" />
            </div>
            <div>
              <div className="text-sm font-semibold text-green-800">Provider is currently working</div>
              <div className="text-xs text-green-600">Checked in at {checkInTime} · Job in progress</div>
            </div>
          </div>
        )}

        <div className="bg-card rounded-2xl p-4 border border-border/40">
          <div className="flex justify-between items-center mb-3">
            <h3 className="font-semibold text-sm" style={{ fontFamily: "Plus Jakarta Sans, sans-serif" }}>Status</h3>
            <Pill color={checkedIn ? "green" : "blue"}>{checkedIn ? "Working" : "In Progress"}</Pill>
          </div>
          <div className="flex items-center gap-1">
            {steps.map((s, i) => (
              <React.Fragment key={s}>
                <div className="flex flex-col items-center gap-1">
                  <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold ${i <= 3 ? "bg-primary text-white" : "bg-muted text-muted-foreground"}`}>
                    {i < 3 ? <Check className="w-3.5 h-3.5" /> : i === 3 ? <div className="w-2 h-2 rounded-full bg-white animate-pulse" /> : i+1}
                  </div>
                  <span className="text-[8px] text-center leading-tight text-muted-foreground w-12">{s}</span>
                </div>
                {i < steps.length - 1 && <div className={`flex-1 h-0.5 mb-4 ${i < 3 ? "bg-primary" : "bg-muted"}`} />}
              </React.Fragment>
            ))}
          </div>
        </div>

        {/* QR Check-in action */}
        {!checkedIn && (
          <div className="bg-card rounded-2xl p-4 border border-border/40">
            <div className="flex items-center gap-2 mb-3">
              <QrCode className="w-4 h-4 text-primary" />
              <span className="text-sm font-semibold text-foreground" style={{ fontFamily: "Plus Jakarta Sans, sans-serif" }}>On-Site Check-In</span>
            </div>
            {isProvider ? (
              <div>
                <p className="text-xs text-muted-foreground mb-3">{"Arrived at the customer's location? Generate your check-in QR code."}</p>
                <Btn variant="primary" full onClick={handleProviderCheckIn}>
                  <QrCode className="w-4 h-4" /> {"I'm On Site — Start Job"}
                </Btn>
              </div>
            ) : (
              <div>
                <p className="text-xs text-muted-foreground mb-3">Has your provider arrived? Scan their check-in code to confirm they are on site.</p>
                <Btn variant="outline" full onClick={() => setShowScanner(true)}>
                  <ScanLine className="w-4 h-4" /> Scan Provider Code
                </Btn>
              </div>
            )}
          </div>
        )}

        <div className="bg-card rounded-2xl p-4 border border-border/40 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <img src={providers[0].avatar} alt="Sarah" className="w-12 h-12 rounded-full object-cover" />
            <div>
              <div className="font-semibold text-foreground">Sarah Chen</div>
              <div className="text-xs text-muted-foreground">Deep Clean · Today 11 AM</div>
              <div className="flex items-center gap-1 mt-0.5">
                <div className={`w-2 h-2 rounded-full ${checkedIn ? "bg-green-500" : "bg-amber-400"}`} />
                <span className={`text-xs font-medium ${checkedIn ? "text-green-600" : "text-amber-600"}`}>{checkedIn ? "Working" : "En route"}</span>
              </div>
            </div>
          </div>
          <div className="flex gap-2">
            <button onClick={() => onNav("chat")} className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center"><MessageSquare className="w-4 h-4 text-primary" /></button>
            <button className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center"><Phone className="w-4 h-4 text-primary" /></button>
          </div>
        </div>
        <div className="bg-card rounded-2xl p-4 border border-border/40">
          <h3 className="font-semibold text-sm mb-3" style={{ fontFamily: "Plus Jakarta Sans, sans-serif" }}>Location</h3>
          <div className="h-32 bg-slate-100 rounded-xl overflow-hidden flex items-center justify-center relative">
            <img src="https://images.unsplash.com/photo-1569336415962-a4bd9f69cd83?w=400&h=130&fit=crop&auto=format" alt="Map" className="w-full h-full object-cover opacity-80" />
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="w-8 h-8 rounded-full bg-primary shadow-lg flex items-center justify-center"><MapPin className="w-4 h-4 text-white" /></div>
            </div>
          </div>
          <p className="text-xs text-muted-foreground mt-2">123 Oak Street, San Francisco, CA 94102</p>
        </div>
        <div className="bg-card rounded-2xl p-4 border border-border/40 space-y-2 text-sm">
          {[["Service", "Deep Clean Package"], ["Date & Time", "Wed, 14 Mar · 11:00 AM"], ["Duration", "4–5 hours"], ["Escrow Amount", "$105.00"], ["Booking ID", "#ES-4829"]].map(([k,v]) => (
            <div key={k} className="flex justify-between"><span className="text-muted-foreground">{k}</span><span className="font-medium text-foreground">{v}</span></div>
          ))}
        </div>
        <div className="bg-amber-50 border border-amber-100 rounded-2xl p-4">
          <div className="flex items-start gap-2">
            <Shield className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
            <p className="text-xs text-amber-700 leading-relaxed">Payment of <strong>$105.00</strong> is held in escrow and will be released to Sarah once you confirm job completion.</p>
          </div>
        </div>
        {!isProvider && (
          <Btn variant="primary" full onClick={() => {
            push({ title: "Payment released!", body: "You released $105.00 to Sarah Chen.", icon: DollarSign, color: "text-green-600", bg: "bg-green-50" });
            onNav("review");
          }}>
            <CheckCircle className="w-4 h-4" /> Confirm & Release Payment
          </Btn>
        )}
        <div className="flex gap-3">
          <button className="flex-1 text-sm text-muted-foreground font-medium text-center py-2">Cancel Booking</button>
          <button onClick={() => {}} className="flex-1 text-sm text-destructive font-medium text-center py-2 flex items-center justify-center gap-1">
            <Flag className="w-3.5 h-3.5" /> Report Issue
          </button>
        </div>
      </div>
    </div>
  );
};

const ChatScreen = ({ onNav }: { onNav: (s: ScreenId) => void }) => {
  const messages = [
    { me: false, text: "Hi Alex! I've confirmed your deep clean booking for Wed 14 March at 11 AM. I'll bring all supplies.", time: "10:02 AM" },
    { me: true, text: "Perfect, thanks Sarah! Could you please focus extra on the kitchen?", time: "10:05 AM" },
    { me: false, text: "Absolutely! Kitchen and bathrooms are my specialty 😊 I use eco-friendly products — is that okay with you?", time: "10:06 AM" },
    { me: true, text: "Yes, eco products are great! One quick thing — I have a dog, she's very friendly.", time: "10:08 AM" },
    { me: false, text: "Love it, I'm great with dogs! I'll be arriving around 10:55 AM. See you then 🐾", time: "10:10 AM" },
  ];
  return (
    <div className="flex flex-col h-full bg-background">
      <StatusBar />
      <div className="flex items-center gap-3 px-4 py-3 bg-card border-b border-border">
        <button onClick={() => onNav("bookingDetail")} className="w-9 h-9 rounded-full bg-background flex items-center justify-center"><ArrowLeft className="w-4 h-4" /></button>
        <div className="relative">
          <img src={providers[0].avatar} alt="Sarah" className="w-9 h-9 rounded-full object-cover" />
          <div className="absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full bg-green-400 border border-white" />
        </div>
        <div className="flex-1">
          <div className="font-semibold text-sm text-foreground">{providers[0].name}</div>
          <div className="text-xs text-green-500 font-medium">Online</div>
        </div>
        <button className="w-9 h-9 rounded-full bg-background flex items-center justify-center"><Phone className="w-4 h-4 text-foreground" /></button>
        <button className="w-9 h-9 rounded-full bg-background flex items-center justify-center"><MoreVertical className="w-4 h-4 text-foreground" /></button>
      </div>
      <div className="flex items-center gap-2 px-4 py-2 bg-primary/5 border-b border-border/50">
        <div className="w-5 h-5 rounded-full bg-primary flex items-center justify-center"><Package className="w-3 h-3 text-white" /></div>
        <p className="text-[10px] text-primary font-medium">Linked to Booking #ES-4829 · Deep Clean · 14 Mar</p>
      </div>
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3" style={{ scrollbarWidth: "none" }}>
        <div className="text-center text-[10px] text-muted-foreground font-medium bg-background rounded-full px-3 py-1 mx-auto w-fit">Today · 14 March</div>
        {messages.map((m, i) => (
          <div key={i} className={`flex items-end gap-2 ${m.me ? "flex-row-reverse" : ""}`}>
            {!m.me && <img src={providers[0].avatar} alt="Sarah" className="w-7 h-7 rounded-full object-cover shrink-0 mb-1" />}
            <div className={`max-w-[72%] rounded-2xl px-4 py-2.5 ${m.me ? "bg-primary text-white rounded-br-sm" : "bg-card border border-border/40 rounded-bl-sm"}`}>
              <p className={`text-sm leading-relaxed ${m.me ? "text-white" : "text-foreground"}`}>{m.text}</p>
              <p className={`text-[9px] mt-1 ${m.me ? "text-white/60 text-right" : "text-muted-foreground"}`}>{m.time}</p>
            </div>
          </div>
        ))}
        <div className="flex items-end gap-2">
          <img src={providers[0].avatar} alt="Sarah" className="w-7 h-7 rounded-full object-cover shrink-0 mb-1" />
          <div className="bg-card border border-border/40 rounded-2xl rounded-bl-sm px-4 py-2.5">
            <div className="flex gap-1">{[0,1,2].map(d=><div key={d} className="w-2 h-2 rounded-full bg-muted-foreground/40 animate-bounce" style={{animationDelay:`${d*0.15}s`}}/>)}</div>
          </div>
        </div>
      </div>
      <div className="px-4 py-3 bg-card border-t border-border flex items-center gap-3">
        <button className="w-9 h-9 rounded-full bg-background flex items-center justify-center shrink-0"><Paperclip className="w-4 h-4 text-muted-foreground" /></button>
        <div className="flex-1 bg-background border border-border rounded-2xl flex items-center px-4 py-2.5">
          <input type="text" placeholder="Type a message..." className="flex-1 text-sm bg-transparent outline-none text-foreground placeholder:text-muted-foreground" />
        </div>
        <button className="w-9 h-9 rounded-full bg-primary flex items-center justify-center shrink-0"><Send className="w-4 h-4 text-white" /></button>
      </div>
    </div>
  );
};

const NotificationsScreen = ({ onNav }: { onNav: (s: ScreenId) => void }) => {
  const { notifLog } = React.useContext(ToastContext);
  const staticNotifs: Array<{ icon: React.ElementType; color: string; bg: string; title: string; body: string; time: string; screen?: ScreenId; unread?: boolean }> = [
    { icon: Wifi, color: "text-green-600", bg: "bg-green-50", title: "Provider On Site", body: "Sarah Chen checked in at your address at 10:55 AM.", time: "Just now", screen: "bookingDetail", unread: true },
    { icon: CheckCircle, color: "text-green-500", bg: "bg-green-50", title: "Booking Confirmed", body: "Sarah Chen accepted your booking for 14 March.", time: "2 min ago", screen: "bookingDetail", unread: true },
    { icon: Lock, color: "text-primary", bg: "bg-blue-50", title: "Escrow Active", body: "$105.00 is secured in escrow for booking #ES-4829.", time: "4 min ago", screen: "bookingDetail", unread: true },
    { icon: MessageSquare, color: "text-purple-500", bg: "bg-purple-50", title: "New Message", body: "Sarah: \"Love it, I'm great with dogs!\"", time: "8 min ago", screen: "chat" },
  ];
  const pastNotifs: typeof staticNotifs = [
    { icon: DollarSign, color: "text-green-600", bg: "bg-green-50", title: "Payment Released", body: "You released $85.00 to Marcus Williams. Job complete!", time: "2 days ago", screen: "customerDashboard" },
    { icon: Star, color: "text-amber-500", bg: "bg-amber-50", title: "Review Received", body: "Priya Sharma left you a 5-star review! 🎉", time: "3 days ago", screen: "providerReviews" },
    { icon: AlertTriangle, color: "text-orange-500", bg: "bg-orange-50", title: "Booking Reminder", body: "Your garden tidy with GreenThumb is tomorrow at 9 AM.", time: "1 week ago", screen: "bookingDetail" },
    { icon: X, color: "text-destructive", bg: "bg-red-50", title: "Booking Declined", body: "Marcus Williams could not accept your 18 March request.", time: "1 week ago" },
  ];
  // Prepend any live toasts that have a screen destination
  const liveNotifs = notifLog.filter(n => n.screen).map(n => ({
    icon: n.icon, color: n.color, bg: n.bg, title: n.title, body: n.body, time: "Now", screen: n.screen, unread: true,
  }));
  const todayAll = [...liveNotifs, ...staticNotifs];

  const NotifRow = ({ n, dimmed = false }: { n: typeof staticNotifs[0]; dimmed?: boolean }) => {
    const I = n.icon;
    return (
      <button
        onClick={() => n.screen && onNav(n.screen)}
        className={`w-full flex items-start gap-3 bg-card rounded-2xl p-3.5 border text-left transition-all hover:shadow-sm ${n.unread ? "border-primary/20 bg-primary/[0.02]" : "border-border/40"} ${dimmed ? "opacity-75" : ""}`}
      >
        <div className={`w-10 h-10 rounded-full ${n.bg} flex items-center justify-center shrink-0`}><I className={`w-5 h-5 ${n.color}`} /></div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2">
            <span className="text-sm font-semibold text-foreground">{n.title}</span>
            {n.unread && <div className="w-2 h-2 rounded-full bg-primary shrink-0" />}
          </div>
          <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">{n.body}</p>
          <span className="text-[10px] text-muted-foreground font-medium">{n.time}</span>
        </div>
        {n.screen && <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0 mt-1" />}
      </button>
    );
  };

  return (
    <div className="flex flex-col h-full bg-background overflow-hidden">
      <StatusBar />
      <BackHeader title="Notifications" onBack={() => onNav("customerHome")} action={<button className="text-xs text-primary font-semibold">Mark all read</button>} />
      <div className="flex-1 overflow-y-auto px-4 pb-4" style={{ scrollbarWidth: "none" }}>
        <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide px-1 mb-2">Today</div>
        <div className="space-y-2 mb-5">
          {todayAll.map((n, i) => <NotifRow key={i} n={n} />)}
        </div>
        <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide px-1 mb-2">Earlier</div>
        <div className="space-y-2">
          {pastNotifs.map((n, i) => <NotifRow key={i} n={n} dimmed />)}
        </div>
      </div>
    </div>
  );
};

const ReviewScreen = ({ onNav }: { onNav: (s: ScreenId) => void }) => {
  const [rating, setRating] = useState(0);
  const [hover, setHover] = useState(0);
  const labels = ["", "Poor", "Fair", "Good", "Great", "Excellent!"];
  return (
    <div className="flex flex-col h-full bg-background overflow-hidden">
      <StatusBar />
      <BackHeader title="Leave a Review" onBack={() => onNav("bookingDetail")} />
      <div className="flex-1 overflow-y-auto px-5 pb-4 space-y-5" style={{ scrollbarWidth: "none" }}>
        <div className="bg-card rounded-2xl p-4 border border-border/40 flex items-center gap-3">
          <img src={providers[0].avatar} alt="Sarah" className="w-14 h-14 rounded-2xl object-cover" />
          <div>
            <div className="font-bold text-foreground">{providers[0].name}</div>
            <div className="text-sm text-muted-foreground">Deep Clean · 14 March 2025</div>
            <div className="text-xs text-muted-foreground">Booking #ES-4829</div>
          </div>
        </div>
        <div className="bg-card rounded-2xl p-6 border border-border/40 text-center">
          <p className="text-sm font-semibold text-foreground mb-1">How was your experience?</p>
          <p className="text-xs text-muted-foreground mb-5">Your honest feedback helps the whole community</p>
          <div className="flex items-center justify-center gap-3 mb-3">
            {[1,2,3,4,5].map(i => (
              <button key={i} onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(0)} onClick={() => setRating(i)} className="transition-transform hover:scale-125">
                <Star className={`w-10 h-10 transition-colors ${(hover||rating) >= i ? "fill-amber-400 text-amber-400" : "text-slate-200 fill-slate-100"}`} />
              </button>
            ))}
          </div>
          {(hover || rating) > 0 && <p className="text-sm font-bold text-amber-500">{labels[hover || rating]}</p>}
        </div>
        <div>
          <div className="text-xs font-semibold text-muted-foreground mb-2 uppercase tracking-wide">Written Review</div>
          <div className="bg-card border border-border rounded-2xl px-4 py-3">
            <textarea rows={4} placeholder="Tell others about your experience with Sarah — what went well, what could be improved..." className="w-full text-sm bg-transparent outline-none text-foreground placeholder:text-muted-foreground resize-none leading-relaxed" />
          </div>
        </div>
        <div>
          <div className="text-xs font-semibold text-muted-foreground mb-2 uppercase tracking-wide">Upload "After" Photos (optional)</div>
          <div className="grid grid-cols-4 gap-2">
            {[
              "https://images.unsplash.com/photo-1600585154340-be6161a56a0c?w=100&h=100&fit=crop&auto=format",
              "https://images.unsplash.com/photo-1556909114-f6e7ad7d3136?w=100&h=100&fit=crop&auto=format",
            ].map((url, i) => (
              <div key={i} className="aspect-square rounded-xl overflow-hidden bg-slate-100 relative">
                <img src={url} alt="After" className="w-full h-full object-cover" />
                <button className="absolute top-1 right-1 w-5 h-5 bg-black/50 rounded-full flex items-center justify-center"><X className="w-3 h-3 text-white" /></button>
              </div>
            ))}
            <button className="aspect-square rounded-xl bg-background border-2 border-dashed border-border flex items-center justify-center col-span-2">
              <div className="flex flex-col items-center gap-1"><Camera className="w-5 h-5 text-muted-foreground" /><span className="text-[10px] text-muted-foreground">Add photo</span></div>
            </button>
          </div>
        </div>
        <div className="bg-card rounded-2xl p-4 border border-border/40">
          <div className="flex items-center gap-2 mb-3">
            <Flag className="w-4 h-4 text-muted-foreground" />
            <span className="text-sm font-semibold text-foreground">Would you report any issues?</span>
          </div>
          <div className="flex gap-2">
            {["No issues", "Minor concern", "Report problem"].map(opt => (
              <button key={opt} className="flex-1 text-xs py-2 rounded-xl border border-border text-muted-foreground font-medium hover:border-primary hover:text-primary transition-colors">{opt}</button>
            ))}
          </div>
        </div>
      </div>
      <div className="shrink-0 bg-card border-t border-border p-4">
        <Btn variant="primary" full onClick={() => onNav("customerDashboard")}>
          <ThumbsUp className="w-4 h-4" /> Submit Review
        </Btn>
      </div>
    </div>
  );
};

const CustomerDashboardScreen = ({ onNav }: { onNav: (s: ScreenId) => void }) => {
  const { logout } = React.useContext(AuthContext);
  const { push } = React.useContext(ToastContext);
  const [tab, setTab] = useState<"bookings"|"messages"|"saved"|"profile">("bookings");
  const [customerAvatar, setCustomerAvatar] = useState("https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=100&h=100&fit=crop&auto=format");
  const [editingAvatar, setEditingAvatar] = useState(false);
  return (
    <div className="flex flex-col h-full bg-background overflow-hidden relative">
      {editingAvatar && (
        <PhotoPickerSheet
          label="Update Profile Photo"
          onClose={() => setEditingAvatar(false)}
          onPick={url => { setCustomerAvatar(url); setEditingAvatar(false); push({ title: "Profile photo updated", body: "Looking good!", icon: CheckCircle, color: "text-green-600", bg: "bg-green-50" }); }}
        />
      )}
      <div style={{ background: "linear-gradient(160deg, #0D3270 0%, #1565C0 100%)" }}>
        <StatusBar dark />
        <div className="px-5 py-3 pb-4">
          <div className="flex items-center justify-between">
            <h1 className="text-xl font-bold text-white" style={{ fontFamily: "Plus Jakarta Sans, sans-serif" }}>My EverySkill</h1>
            <button onClick={() => onNav("notifications")} className="w-9 h-9 rounded-full bg-white/15 flex items-center justify-center relative">
              <Bell className="w-4 h-4 text-white" />
              <div className="absolute top-0.5 right-0.5 w-2 h-2 bg-accent rounded-full border border-white" />
            </button>
          </div>
        </div>
      </div>
      <div className="flex bg-card border-b border-border">
        {(["bookings", "messages", "saved", "profile"] as const).map(t => (
          <button key={t} onClick={() => setTab(t)} className={`flex-1 py-3 text-xs font-semibold capitalize border-b-2 transition-colors ${tab===t?"border-primary text-primary":"border-transparent text-muted-foreground"}`}>{t}</button>
        ))}
      </div>
      <div className="flex-1 overflow-y-auto pb-20" style={{ scrollbarWidth: "none" }}>
        {tab === "bookings" && (
          <div className="px-4 py-4 space-y-4">
            <div>
              <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Active</h3>
              {[
                { name: "Sarah Chen", service: "Deep Clean", date: "Wed, 14 Mar · 11 AM", status: "In Progress", color: "blue" as const, avatar: providers[0].avatar },
                { name: "Marcus Williams", service: "Boiler Service", date: "Fri, 16 Mar · 2 PM", status: "Accepted", color: "green" as const, avatar: providers[1].avatar },
              ].map(b => (
                <button key={b.name} onClick={() => onNav("bookingDetail")} className="w-full bg-card rounded-2xl p-4 border border-border/40 shadow-sm text-left mb-2 hover:shadow-md transition-shadow">
                  <div className="flex items-center gap-3">
                    <img src={b.avatar} alt={b.name} className="w-10 h-10 rounded-xl object-cover" />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between">
                        <span className="font-semibold text-sm text-foreground">{b.name}</span>
                        <Pill color={b.color} sm>{b.status}</Pill>
                      </div>
                      <div className="text-xs text-muted-foreground">{b.service}</div>
                      <div className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5"><Calendar className="w-3 h-3" />{b.date}</div>
                    </div>
                  </div>
                </button>
              ))}
            </div>
            <div>
              <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Past</h3>
              {[
                { name: "Priya Sharma", service: "Dog Walking · 3x", date: "Jan–Feb 2025", status: "Completed", avatar: providers[2].avatar },
              ].map(b => (
                <div key={b.name} className="bg-card rounded-2xl p-4 border border-border/40 opacity-75">
                  <div className="flex items-center gap-3">
                    <img src={b.avatar} alt={b.name} className="w-10 h-10 rounded-xl object-cover" />
                    <div className="flex-1">
                      <div className="flex items-center justify-between">
                        <span className="font-semibold text-sm text-foreground">{b.name}</span>
                        <Pill color="gray" sm>{b.status}</Pill>
                      </div>
                      <div className="text-xs text-muted-foreground">{b.service}</div>
                      <div className="text-xs text-muted-foreground">{b.date}</div>
                    </div>
                  </div>
                  <div className="flex gap-2 mt-3">
                    <Btn variant="outline" sm className="flex-1 text-xs">Book again</Btn>
                    <Btn variant="ghost" sm className="flex-1 text-xs"><Star className="w-3 h-3" />Review</Btn>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
        {tab === "messages" && (
          <div className="px-4 py-4 space-y-2">
            {providers.map(p => (
              <button key={p.id} onClick={() => onNav("chat")} className="w-full bg-card rounded-2xl p-4 border border-border/40 flex items-center gap-3 text-left hover:shadow-md transition-shadow">
                <div className="relative">
                  <img src={p.avatar} alt={p.name} className="w-12 h-12 rounded-full object-cover" />
                  {p.id===1&&<div className="absolute bottom-0 right-0 w-3 h-3 bg-green-400 rounded-full border border-white" />}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex justify-between items-center"><span className="font-semibold text-sm text-foreground">{p.name}</span><span className="text-[10px] text-muted-foreground">10:10 AM</span></div>
                  <p className="text-xs text-muted-foreground truncate">{p.id===1?"See you then 🐾":p.id===2?"Thanks, I'll be there at 2 PM.":"Your pup had a great walk today!"}</p>
                </div>
                {p.id===1&&<div className="w-2 h-2 rounded-full bg-primary shrink-0" />}
              </button>
            ))}
          </div>
        )}
        {tab === "saved" && (
          <div className="px-4 py-4 space-y-3">
            {providers.map(p => (
              <ProviderCard key={p.id} p={p} onPress={() => onNav("providerProfile")} />
            ))}
          </div>
        )}
        {tab === "profile" && (
          <div className="px-4 py-4">
            <div className="flex flex-col items-center py-6 mb-4">
              <div className="relative mb-3">
                <img src={customerAvatar} alt="Alex" className="w-20 h-20 rounded-full object-cover border-4 border-card shadow-lg" />
                <button onClick={() => setEditingAvatar(true)} className="absolute -bottom-1 -right-1 w-7 h-7 bg-primary rounded-full flex items-center justify-center border-2 border-card shadow">
                  <Pencil className="w-3 h-3 text-white" />
                </button>
              </div>
              <h2 className="text-xl font-bold text-foreground" style={{ fontFamily: "Plus Jakarta Sans, sans-serif" }}>Alex Johnson</h2>
              <p className="text-muted-foreground text-sm">alex.j@email.com</p>
              <Pill color="blue" sm className="mt-2"><CheckCircle className="w-2.5 h-2.5" />Verified Customer</Pill>
            </div>
            <div className="space-y-1">
              {[
                { icon: CreditCard, label: "Payment Methods", color: "text-primary" },
                { icon: Shield, label: "Privacy & GDPR Settings", color: "text-primary" },
                { icon: Download, label: "Download My Data", color: "text-primary" },
                { icon: Bell, label: "Notification Preferences", color: "text-primary" },
                { icon: Globe, label: "Language & Region", color: "text-primary" },
                { icon: AlertTriangle, label: "Delete Account", color: "text-destructive" },
              ].map(item => {
                const I = item.icon;
                return (
                  <button key={item.label} className="w-full flex items-center gap-4 bg-card rounded-2xl px-4 py-3.5 border border-border/40 text-left">
                    <div className="w-9 h-9 rounded-xl bg-background flex items-center justify-center"><I className={`w-4 h-4 ${item.color}`} /></div>
                    <span className="text-sm font-medium text-foreground flex-1">{item.label}</span>
                    <ChevronRight className="w-4 h-4 text-muted-foreground" />
                  </button>
                );
              })}
            </div>
            <div className="mt-4">
              <Btn variant="ghost" full className="text-destructive hover:bg-red-50" onClick={() => { logout(); onNav("splash"); }}>
                <LogOut className="w-4 h-4" /> Log Out
              </Btn>
            </div>
          </div>
        )}
      </div>
      <BottomNav active={tab === "bookings" ? "bookings" : tab === "messages" ? "messages" : tab === "saved" ? "saved" : "profile"} onNav={onNav} />
    </div>
  );
};

// ─── Provider Screens ────────────────────────────────────────────────────────
const ProviderDashboardScreen = ({ onNav }: { onNav: (s: ScreenId) => void }) => (
  <div className="flex flex-col h-full bg-background">
    <div style={{ background: "linear-gradient(160deg, #0D3270 0%, #1565C0 100%)" }}>
      <StatusBar dark />
      <div className="px-5 py-3 pb-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <p className="text-white/70 text-sm">Good morning</p>
            <h1 className="text-xl font-bold text-white" style={{ fontFamily: "Plus Jakarta Sans, sans-serif" }}>Sarah's Dashboard</h1>
          </div>
          <img src={providers[0].avatar} alt="Sarah" className="w-10 h-10 rounded-full border-2 border-white/40 object-cover" />
        </div>
        <div className="bg-white/15 rounded-2xl p-4">
          <p className="text-white/70 text-xs font-medium mb-1">This Month</p>
          <div className="flex items-end gap-2 mb-1">
            <span className="text-3xl font-extrabold text-white" style={{ fontFamily: "Plus Jakarta Sans, sans-serif" }}>$2,840</span>
            <div className="flex items-center gap-1 mb-1"><TrendingUp className="w-4 h-4 text-green-300" /><span className="text-green-300 text-sm font-semibold">+18%</span></div>
          </div>
          <p className="text-white/60 text-xs">vs $2,407 last month</p>
        </div>
      </div>
    </div>
    <div className="flex-1 overflow-y-auto px-4 pt-4 pb-4 space-y-4" style={{ scrollbarWidth: "none" }}>
      <div className="grid grid-cols-3 gap-2">
        {[{ label: "Upcoming", val: "3", sub: "bookings", color: "text-primary" }, { label: "Completed", val: "28", sub: "this month", color: "text-green-600" }, { label: "Rating", val: "4.9★", sub: "127 reviews", color: "text-amber-500" }].map(s => (
          <div key={s.label} className="bg-card rounded-2xl p-3 text-center border border-border/40 shadow-sm">
            <div className={`text-xl font-bold ${s.color}`} style={{ fontFamily: "Plus Jakarta Sans, sans-serif" }}>{s.val}</div>
            <div className="text-[10px] text-foreground font-semibold">{s.label}</div>
            <div className="text-[9px] text-muted-foreground">{s.sub}</div>
          </div>
        ))}
      </div>
      <div className="bg-card rounded-2xl p-4 border border-border/40">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-bold text-sm text-foreground" style={{ fontFamily: "Plus Jakarta Sans, sans-serif" }}>Earnings Trend</h3>
          <Pill color="blue" sm>12 weeks</Pill>
        </div>
        <ResponsiveContainer width="100%" height={100}>
          <AreaChart data={earningsData} margin={{ top: 5, right: 5, bottom: 0, left: -20 }}>
            <defs>
              <linearGradient id="eGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#1565C0" stopOpacity={0.3} />
                <stop offset="95%" stopColor="#1565C0" stopOpacity={0} />
              </linearGradient>
            </defs>
            <XAxis dataKey="wk" tick={{ fontSize: 9, fill: "#94A3B8" }} tickLine={false} axisLine={false} />
            <Tooltip contentStyle={{ fontSize: 11, borderRadius: 8, border: "none", boxShadow: "0 4px 20px rgba(0,0,0,0.1)" }} formatter={(v: number) => [`$${v}`, "Earnings"]} />
            <Area type="monotone" dataKey="v" stroke="#1565C0" fill="url(#eGrad)" strokeWidth={2} dot={false} />
          </AreaChart>
        </ResponsiveContainer>
      </div>
      <div>
        <div className="flex items-center justify-between mb-2">
          <h3 className="font-bold text-sm text-foreground" style={{ fontFamily: "Plus Jakarta Sans, sans-serif" }}>Upcoming Bookings</h3>
          <button className="text-xs text-primary font-medium" onClick={() => onNav("bookingInbox")}>View all</button>
        </div>
        <div className="space-y-2">
          {[
            { name: "Alex Johnson", service: "Deep Clean", date: "Wed, 14 Mar · 11 AM", price: "$120", avatar: "https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=60&h=60&fit=crop&auto=format" },
            { name: "Jordan Taylor", service: "Move-Out Clean", date: "Thu, 15 Mar · 9 AM", price: "$180", avatar: "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=60&h=60&fit=crop&auto=format" },
            { name: "Emma Williams", service: "Regular Clean", date: "Fri, 16 Mar · 2 PM", price: "$90", avatar: "https://images.unsplash.com/photo-1438761681033-6461ffad8d80?w=60&h=60&fit=crop&auto=format" },
          ].map(b => (
            <div key={b.name} className="bg-card rounded-2xl p-3.5 border border-border/40 flex items-center gap-3">
              <img src={b.avatar} alt={b.name} className="w-10 h-10 rounded-full object-cover" />
              <div className="flex-1 min-w-0">
                <div className="font-semibold text-sm text-foreground">{b.name}</div>
                <div className="text-xs text-muted-foreground">{b.service}</div>
                <div className="text-xs text-muted-foreground flex items-center gap-1"><Calendar className="w-3 h-3" />{b.date}</div>
              </div>
              <span className="font-bold text-sm text-foreground">{b.price}</span>
            </div>
          ))}
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2">
        {[
          { icon: Package, label: "Listings", screen: "providerListings" as ScreenId },
          { icon: Calendar, label: "Calendar", screen: "providerCalendar" as ScreenId },
          { icon: Award, label: "Certificates", screen: "providerCertificates" as ScreenId },
          { icon: Star, label: "Reviews", screen: "providerReviews" as ScreenId },
          { icon: Wallet, label: "Billing History", screen: "providerBilling" as ScreenId },
        ].map(item => {
          const I = item.icon;
          return (
            <button key={item.label} onClick={() => onNav(item.screen)} className="bg-card rounded-2xl p-4 border border-border/40 flex items-center gap-3 hover:border-primary/30 transition-colors">
              <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center"><I className="w-4 h-4 text-primary" /></div>
              <span className="font-semibold text-sm text-foreground">{item.label}</span>
              <ChevronRight className="w-4 h-4 text-muted-foreground ml-auto" />
            </button>
          );
        })}
      </div>
    </div>
  </div>
);

const ProviderListingsScreen = ({ onNav }: { onNav: (s: ScreenId) => void }) => {
  const [listings] = useState([
    { title: "Regular Clean", price: "$45/hr", bookings: 89, active: true },
    { title: "Deep Clean", price: "$120 flat", bookings: 41, active: true },
    { title: "Move-Out Clean", price: "$180 flat", bookings: 18, active: false },
  ]);
  return (
    <div className="flex flex-col h-full bg-background">
      <StatusBar />
      <div className="flex items-center justify-between px-4 py-3">
        <div className="flex items-center gap-3">
          <button onClick={() => onNav("providerDashboard")} className="w-9 h-9 rounded-full bg-background flex items-center justify-center"><ArrowLeft className="w-4 h-4" /></button>
          <h2 className="font-bold text-lg text-foreground" style={{ fontFamily: "Plus Jakarta Sans, sans-serif" }}>My Services</h2>
        </div>
        <button onClick={() => onNav("createListing")} className="w-9 h-9 rounded-full bg-primary flex items-center justify-center shadow-md shadow-primary/30"><Plus className="w-4 h-4 text-white" /></button>
      </div>
      <div className="flex-1 px-4 pb-4 space-y-3 overflow-y-auto" style={{ scrollbarWidth: "none" }}>
        {listings.map((l, i) => (
          <div key={l.title} className={`bg-card rounded-2xl p-4 border ${l.active ? "border-border/40" : "border-border/20 opacity-60"}`}>
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center shrink-0"><Package className="w-6 h-6 text-primary" /></div>
              <div className="flex-1 min-w-0">
                <div className="font-bold text-foreground">{l.title}</div>
                <div className="text-sm text-muted-foreground">{l.price}</div>
                <div className="text-xs text-muted-foreground">{l.bookings} bookings total</div>
              </div>
              <div className="flex flex-col items-center gap-2">
                <div className={`w-10 h-6 rounded-full transition-colors flex items-center px-0.5 ${l.active ? "bg-primary" : "bg-muted"}`}>
                  <div className={`w-5 h-5 rounded-full bg-white shadow transition-transform ${l.active ? "translate-x-4" : "translate-x-0"}`} />
                </div>
                <span className="text-[9px] font-medium text-muted-foreground">{l.active ? "Live" : "Paused"}</span>
              </div>
            </div>
            <div className="flex gap-2 mt-3 pt-3 border-t border-border/50">
              <button className="flex-1 flex items-center justify-center gap-1.5 text-xs font-medium text-primary py-2 rounded-xl bg-primary/5"><Edit className="w-3.5 h-3.5" />Edit</button>
              <button className="flex-1 flex items-center justify-center gap-1.5 text-xs font-medium text-muted-foreground py-2 rounded-xl bg-background"><BarChart2 className="w-3.5 h-3.5" />Analytics</button>
              <button className="flex-1 flex items-center justify-center gap-1.5 text-xs font-medium text-destructive py-2 rounded-xl bg-red-50"><Trash2 className="w-3.5 h-3.5" />Delete</button>
            </div>
          </div>
        ))}
        <button onClick={() => onNav("createListing")} className="w-full border-2 border-dashed border-primary/30 rounded-2xl py-6 flex flex-col items-center gap-2 hover:bg-primary/2 transition-colors">
          <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center"><Plus className="w-5 h-5 text-primary" /></div>
          <span className="text-sm font-semibold text-primary">Add New Service</span>
        </button>
      </div>
    </div>
  );
};

const CreateListingScreen = ({ onNav }: { onNav: (s: ScreenId) => void }) => {
  const [desc, setDesc] = useState("");
  const [showSuggestion, setShowSuggestion] = useState(false);
  const [pricingMode, setPricingMode] = useState<"Hourly"|"Fixed">("Fixed");
  return (
    <div className="flex flex-col h-full bg-background overflow-hidden">
      <StatusBar />
      <BackHeader title="New Service" onBack={() => onNav("providerListings")} />
      <div className="flex-1 px-5 pb-4 space-y-4 overflow-y-auto" style={{ scrollbarWidth: "none" }}>
        <Input2 label="Service Title" placeholder="e.g. Professional Deep Clean" />
        <div>
          <div className="text-xs font-semibold text-muted-foreground mb-1.5 uppercase tracking-wide">Description</div>
          <div className="bg-background border border-border rounded-xl px-4 py-3">
            <textarea
              rows={4}
              placeholder="Describe what's included in this service..."
              className="w-full text-sm bg-transparent outline-none text-foreground placeholder:text-muted-foreground resize-none"
              value={desc}
              onChange={e => { setDesc(e.target.value); if (e.target.value.length > 20) setShowSuggestion(true); }}
            />
          </div>
          {showSuggestion && (
            <div className="mt-2 flex items-center gap-2 bg-primary/5 rounded-xl px-3 py-2">
              <Zap className="w-3.5 h-3.5 text-primary shrink-0" />
              <p className="text-xs text-primary flex-1">AI suggests: <strong>House Cleaning → Deep Clean</strong></p>
              <button className="text-xs text-primary font-semibold">Apply</button>
            </div>
          )}
        </div>

        {/* Pricing — stateful hourly / fixed toggle */}
        <div>
          <div className="text-xs font-semibold text-muted-foreground mb-2 uppercase tracking-wide">Pricing Model</div>
          <div className="flex gap-1 bg-background rounded-xl p-1 border border-border mb-3">
            {(["Hourly", "Fixed"] as const).map(t => (
              <button
                key={t}
                onClick={() => setPricingMode(t)}
                className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-semibold transition-all ${pricingMode === t ? "bg-primary text-white shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
              >
                {t === "Hourly" ? <Clock className="w-3 h-3" /> : <DollarSign className="w-3 h-3" />}
                {t}
              </button>
            ))}
          </div>

          {pricingMode === "Hourly" ? (
            <div className="space-y-3">
              <div className="flex items-center gap-3 bg-background border border-border rounded-xl px-4 py-3">
                <DollarSign className="w-4 h-4 text-muted-foreground shrink-0" />
                <input type="number" placeholder="45" className="flex-1 text-sm bg-transparent outline-none text-foreground" />
                <span className="text-sm text-muted-foreground font-medium">/hr</span>
              </div>
              <Input2 label="Min. duration" placeholder="1 hour" icon={Clock} />
              <div className="bg-primary/5 border border-primary/10 rounded-xl px-3 py-2 flex items-center gap-2">
                <Info className="w-3.5 h-3.5 text-primary shrink-0" />
                <p className="text-xs text-primary">Customers will pay the hourly rate × actual hours worked, held in escrow.</p>
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="flex items-center gap-3 bg-background border border-border rounded-xl px-4 py-3">
                <DollarSign className="w-4 h-4 text-muted-foreground shrink-0" />
                <input type="number" placeholder="120" className="flex-1 text-sm bg-transparent outline-none text-foreground" />
                <span className="text-sm text-muted-foreground font-medium">flat</span>
              </div>
              <Input2 label="Est. duration" placeholder="4–5 hours" icon={Clock} />
            </div>
          )}
        </div>
        <div>
          <div className="text-xs font-semibold text-muted-foreground mb-2 uppercase tracking-wide">Category</div>
          <div className="grid grid-cols-3 gap-2">
            {categories.map((c, i) => {
              const I = c.icon;
              return (
                <button key={c.label} className={`flex flex-col items-center gap-1.5 rounded-xl py-3 border-2 text-xs font-medium transition-all ${i===0?"border-primary text-primary":"border-border text-muted-foreground"}`} style={i===0?{background:c.bg}:{}}>
                  <I className="w-4 h-4" style={i===0?{color:c.color}:{}} />
                  {c.label}
                </button>
              );
            })}
          </div>
        </div>
        <div>
          <div className="text-xs font-semibold text-muted-foreground mb-2 uppercase tracking-wide">Service Photos</div>
          <div className="grid grid-cols-3 gap-2">
            {[1,2].map(i => (
              <div key={i} className="aspect-square rounded-xl bg-slate-100 overflow-hidden">
                <img src={`https://images.unsplash.com/photo-158157873154${i}-c64695cc6952?w=120&h=120&fit=crop&auto=format`} alt="" className="w-full h-full object-cover" />
              </div>
            ))}
            <button className="aspect-square rounded-xl border-2 border-dashed border-border flex items-center justify-center bg-background">
              <div className="flex flex-col items-center gap-1"><Camera className="w-5 h-5 text-muted-foreground" /><span className="text-[9px] text-muted-foreground">Add</span></div>
            </button>
          </div>
        </div>
      </div>
      <div className="shrink-0 bg-card border-t border-border p-4 flex gap-3">
        <Btn variant="outline" sm className="flex-1">Save Draft</Btn>
        <Btn variant="primary" full sm onClick={() => onNav("providerListings")}>Publish Service</Btn>
      </div>
    </div>
  );
};

const ProviderCalendarScreen = ({ onNav }: { onNav: (s: ScreenId) => void }) => {
  const [selected, setSelected] = useState(14);
  const bookings = { 11: "green", 14: "blue", 15: "blue", 16: "orange", 20: "green", 22: "blue" } as Record<number, string>;
  return (
    <div className="flex flex-col h-full bg-background">
      <StatusBar />
      <BackHeader title="Schedule" onBack={() => onNav("providerDashboard")} action={<Btn variant="primary" sm onClick={() => {}}>+ Block</Btn>} />
      <div className="flex-1 px-4 pb-4 overflow-y-auto" style={{ scrollbarWidth: "none" }}>
        <div className="bg-card rounded-2xl p-4 border border-border/40 mb-4">
          <div className="flex items-center justify-between mb-3">
            <button className="w-8 h-8 flex items-center justify-center"><ChevronLeft className="w-4 h-4 text-foreground" /></button>
            <h3 className="font-bold text-foreground" style={{ fontFamily: "Plus Jakarta Sans, sans-serif" }}>March 2025</h3>
            <button className="w-8 h-8 flex items-center justify-center"><ChevronRight className="w-4 h-4 text-foreground" /></button>
          </div>
          <div className="grid grid-cols-7 gap-1 mb-2">
            {["M","T","W","T","F","S","S"].map((d,i) => <div key={i} className="text-center text-[9px] font-semibold text-muted-foreground py-1">{d}</div>)}
          </div>
          <div className="grid grid-cols-7 gap-1">
            {Array.from({length:31},(_,i)=>i+1).map(d => {
              const hasBooking = bookings[d];
              const isSelected = d === selected;
              return (
                <button key={d} onClick={() => setSelected(d)} className={`aspect-square rounded-full flex items-center justify-center text-xs font-medium transition-all relative ${isSelected ? "bg-primary text-white" : "hover:bg-background text-foreground"}`}>
                  {d}
                  {hasBooking && !isSelected && <div className={`absolute bottom-0.5 w-1.5 h-1.5 rounded-full ${hasBooking === "blue" ? "bg-primary" : hasBooking === "green" ? "bg-green-400" : "bg-orange-400"}`} />}
                </button>
              );
            })}
          </div>
        </div>
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-bold text-sm text-foreground" style={{ fontFamily: "Plus Jakarta Sans, sans-serif" }}>Wed, 14 March</h3>
          <Pill color="blue" sm>2 bookings</Pill>
        </div>
        <div className="space-y-2">
          {[
            { time: "11:00 AM", duration: "4–5h", name: "Alex Johnson", service: "Deep Clean", color: "bg-primary text-white" },
            { time: "4:00 PM", duration: "2h", name: "Jordan Taylor", service: "Regular Clean", color: "bg-blue-100 text-blue-700" },
          ].map(b => (
            <div key={b.time} className={`${b.color} rounded-2xl p-4`}>
              <div className="flex items-center justify-between">
                <div>
                  <div className="font-bold text-sm">{b.time} · {b.duration}</div>
                  <div className="font-medium">{b.name}</div>
                  <div className="text-xs opacity-75">{b.service}</div>
                </div>
                <ChevronRight className="w-5 h-5 opacity-60" />
              </div>
            </div>
          ))}
          <div className="flex items-center gap-3 border-2 border-dashed border-border rounded-2xl p-4 text-muted-foreground">
            <div className="w-8 h-8 rounded-full bg-background flex items-center justify-center"><Plus className="w-4 h-4" /></div>
            <span className="text-sm">Mark as unavailable</span>
          </div>
        </div>
      </div>
    </div>
  );
};

const BookingInboxScreen = ({ onNav }: { onNav: (s: ScreenId) => void }) => {
  const [tab, setTab] = useState<"pending"|"upcoming"|"completed">("pending");
  const { push } = React.useContext(ToastContext);
  const { quotePhotos, setQuoteData, setQuoteStatus } = React.useContext(QuoteContext);
  const [quoteDuration, setQuoteDuration] = useState("3 hours");
  const [quotePrice, setQuotePrice] = useState("$145");
  const [quoteNote, setQuoteNote] = useState("Based on the photos, this looks like a thorough deep clean. Happy to discuss details via chat.");
  const [quoteSent, setQuoteSent] = useState(false);

  const handleSendQuote = () => {
    setQuoteData({ duration: quoteDuration, price: quotePrice, note: quoteNote });
    setQuoteStatus("quoted");
    setQuoteSent(true);
    push({ title: "Quote sent!", body: "Alex Johnson has been notified to review your estimate.", icon: CheckCircle, color: "text-green-600", bg: "bg-green-50" });
  };

  return (
    <div className="flex flex-col h-full bg-background">
      <StatusBar />
      <BackHeader title="Booking Requests" onBack={() => onNav("providerDashboard")} />
      <div className="flex border-b border-border bg-card">
        {(["pending", "upcoming", "completed"] as const).map(t => (
          <button key={t} onClick={() => setTab(t)} className={`flex-1 py-3 text-xs font-semibold capitalize border-b-2 transition-colors ${tab===t?"border-primary text-primary":"border-transparent text-muted-foreground"}`}>
            {t}{t==="pending"&&<span className="ml-1 bg-accent text-white rounded-full text-[9px] px-1.5 py-0.5">3</span>}
          </button>
        ))}
      </div>
      <div className="flex-1 px-4 py-4 space-y-3 overflow-y-auto" style={{ scrollbarWidth: "none" }}>
        {tab === "pending" && <>
          {/* Photo quote request card */}
          <div className="bg-card rounded-2xl border-2 border-primary/30 overflow-hidden shadow-sm">
            <div className="bg-primary/8 px-4 py-3 flex items-center gap-2">
              <Camera className="w-4 h-4 text-primary" />
              <span className="text-sm font-bold text-foreground" style={{ fontFamily: "Plus Jakarta Sans, sans-serif" }}>Quote Request</span>
              <span className="text-xs text-muted-foreground ml-auto">Alex Johnson</span>
            </div>
            <div className="p-4 space-y-3">
              <div className="flex items-center gap-3">
                <img src="https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=60&h=60&fit=crop&auto=format" alt="Alex" className="w-10 h-10 rounded-xl object-cover" />
                <div className="flex-1">
                  <div className="font-semibold text-sm text-foreground">Alex Johnson</div>
                  <div className="text-xs text-muted-foreground">Deep Clean · Mon, 17 Mar</div>
                </div>
                <Pill color="blue" sm>Quote Needed</Pill>
              </div>
              {quotePhotos.length > 0 && (
                <div>
                  <div className="text-xs text-muted-foreground mb-2 font-medium">Customer photos ({quotePhotos.length})</div>
                  <div className="flex gap-2 overflow-x-auto pb-1" style={{ scrollbarWidth: "none" }}>
                    {quotePhotos.map((url, i) => (
                      <div key={i} className="w-20 h-20 rounded-xl overflow-hidden shrink-0 border border-border/40">
                        <img src={url} alt="" className="w-full h-full object-cover" />
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {quotePhotos.length === 0 && (
                <div className="flex gap-2 overflow-x-auto pb-1" style={{ scrollbarWidth: "none" }}>
                  {["https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=160&h=160&fit=crop&auto=format","https://images.unsplash.com/photo-1584622650111-993a426fbf0a?w=160&h=160&fit=crop&auto=format"].map((url, i) => (
                    <div key={i} className="w-20 h-20 rounded-xl overflow-hidden shrink-0 border border-border/40">
                      <img src={url} alt="" className="w-full h-full object-cover" />
                    </div>
                  ))}
                </div>
              )}
              {!quoteSent ? (
                <>
                  <div className="text-xs font-semibold text-foreground">Your Estimate</div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="text-[10px] text-muted-foreground block mb-1">Est. Duration</label>
                      <input value={quoteDuration} onChange={e => setQuoteDuration(e.target.value)} className="w-full bg-background rounded-xl px-3 py-2.5 text-sm font-medium text-foreground border border-border/60 outline-none focus:border-primary" />
                    </div>
                    <div>
                      <label className="text-[10px] text-muted-foreground block mb-1">Your Price</label>
                      <input value={quotePrice} onChange={e => setQuotePrice(e.target.value)} className="w-full bg-background rounded-xl px-3 py-2.5 text-sm font-bold text-foreground border border-border/60 outline-none focus:border-primary" />
                    </div>
                  </div>
                  <div>
                    <label className="text-[10px] text-muted-foreground block mb-1">Note to customer (optional)</label>
                    <textarea value={quoteNote} onChange={e => setQuoteNote(e.target.value)} rows={2} className="w-full bg-background rounded-xl px-3 py-2 text-xs text-foreground border border-border/60 outline-none focus:border-primary resize-none" />
                  </div>
                  <div className="flex gap-2 pt-1">
                    <button className="flex-1 flex items-center justify-center gap-1.5 bg-red-50 text-destructive text-sm font-semibold py-2.5 rounded-xl"><X className="w-4 h-4" />Decline</button>
                    <button onClick={handleSendQuote} className="flex-2 flex items-center justify-center gap-1.5 bg-primary text-white text-sm font-semibold px-6 py-2.5 rounded-xl"><Send className="w-4 h-4" />Send Quote</button>
                  </div>
                </>
              ) : (
                <div className="flex items-center gap-2 bg-green-50 rounded-xl px-3 py-2.5">
                  <CheckCircle className="w-4 h-4 text-green-600" />
                  <div>
                    <div className="text-sm font-semibold text-green-800">Quote sent · {quotePrice} for {quoteDuration}</div>
                    <div className="text-xs text-green-600">Waiting for {"customer's"} response</div>
                  </div>
                </div>
              )}
            </div>
          </div>
          {[
          { name: "Emma Williams", service: "Regular Clean", date: "Fri, 16 Mar · 2 PM", price: "$90", timer: "3h 10m left", avatar: "https://images.unsplash.com/photo-1438761681033-6461ffad8d80?w=60&h=60&fit=crop&auto=format" },
        ].map(r => (
          <div key={r.name} className="bg-card rounded-2xl p-4 border border-accent/20 shadow-sm">
            <div className="flex items-center gap-2 mb-3">
              <Pill color="orange" sm><Clock className="w-2.5 h-2.5" />Auto-declines in {r.timer}</Pill>
            </div>
            <div className="flex items-center gap-3 mb-3">
              <img src={r.avatar} alt={r.name} className="w-12 h-12 rounded-2xl object-cover" />
              <div className="flex-1">
                <div className="font-bold text-foreground">{r.name}</div>
                <div className="text-sm text-muted-foreground">{r.service}</div>
                <div className="text-xs text-muted-foreground flex items-center gap-1"><Calendar className="w-3 h-3" />{r.date}</div>
              </div>
              <div className="text-xl font-extrabold text-foreground" style={{ fontFamily: "Plus Jakarta Sans, sans-serif" }}>{r.price}</div>
            </div>
            <div className="flex gap-2">
              <button className="flex-1 flex items-center justify-center gap-1.5 bg-red-50 text-destructive text-sm font-semibold py-2.5 rounded-xl"><X className="w-4 h-4" />Decline</button>
              <button className="flex-2 flex items-center justify-center gap-1.5 bg-primary text-white text-sm font-semibold px-8 py-2.5 rounded-xl"><Check className="w-4 h-4" />Accept</button>
            </div>
          </div>
        ))}</>}
        {tab === "upcoming" && [
          { name: "Jordan Taylor", service: "Move-Out Clean", date: "Thu, 15 Mar · 9 AM", price: "$180", avatar: "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=60&h=60&fit=crop&auto=format" },
        ].map(b => (
          <div key={b.name} className="bg-card rounded-2xl p-4 border border-border/40">
            <div className="flex items-center gap-3">
              <img src={b.avatar} alt={b.name} className="w-12 h-12 rounded-2xl object-cover" />
              <div className="flex-1">
                <div className="font-bold text-foreground">{b.name}</div>
                <div className="text-sm text-muted-foreground">{b.service}</div>
                <div className="text-xs text-muted-foreground flex items-center gap-1"><Calendar className="w-3 h-3" />{b.date}</div>
              </div>
              <Pill color="green" sm>Confirmed</Pill>
            </div>
          </div>
        ))}
        {tab === "completed" && (
          <div className="flex flex-col items-center py-12 text-center">
            <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center mb-3"><CheckCircle className="w-8 h-8 text-muted-foreground" /></div>
            <p className="font-semibold text-foreground">28 completed this month</p>
            <p className="text-sm text-muted-foreground mt-1">Showing current month only</p>
          </div>
        )}
      </div>
    </div>
  );
};

const ProviderCertificatesScreen = ({ onNav }: { onNav: (s: ScreenId) => void }) => (
  <div className="flex flex-col h-full bg-background">
    <StatusBar />
    <BackHeader title="Trust & Verification" onBack={() => onNav("providerDashboard")} />
    <div className="flex-1 px-4 pb-4 space-y-4 overflow-y-auto" style={{ scrollbarWidth: "none" }}>
      <div className="bg-primary rounded-2xl p-5 text-center">
        <div className="w-16 h-16 rounded-full bg-white/20 flex items-center justify-center mx-auto mb-3">
          <Shield className="w-8 h-8 text-white" />
        </div>
        <div className="text-white font-bold text-lg" style={{ fontFamily: "Plus Jakarta Sans, sans-serif" }}>Fully Verified Provider</div>
        <p className="text-white/70 text-xs mt-1">All checks passed · Badge displayed on your profile</p>
      </div>
      <h3 className="font-bold text-foreground text-sm" style={{ fontFamily: "Plus Jakarta Sans, sans-serif" }}>Verification Checks</h3>
      <div className="space-y-2">
        {[
          { label: "Government ID", status: "Verified", date: "Jan 12, 2025", color: "green" as const },
          { label: "Address Proof", status: "Verified", date: "Jan 12, 2025", color: "green" as const },
          { label: "Background Check", status: "Verified", date: "Feb 3, 2025", color: "green" as const },
          { label: "Phone Number", status: "Verified", date: "Jan 10, 2025", color: "green" as const },
          { label: "Insurance Certificate", status: "Verified", date: "Jan 15, 2025", color: "green" as const },
        ].map(c => (
          <div key={c.label} className="bg-card rounded-2xl p-4 border border-border/40 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-full bg-green-100 flex items-center justify-center"><Check className="w-4 h-4 text-green-600" /></div>
              <div>
                <div className="font-semibold text-sm text-foreground">{c.label}</div>
                <div className="text-xs text-muted-foreground">{c.date}</div>
              </div>
            </div>
            <Pill color={c.color} sm>{c.status}</Pill>
          </div>
        ))}
      </div>
      <h3 className="font-bold text-foreground text-sm" style={{ fontFamily: "Plus Jakarta Sans, sans-serif" }}>Professional Certificates</h3>
      <div className="space-y-2">
        {[
          { label: "NCCA Cleaning Level 2", issuer: "NCCA · 2023" },
          { label: "Eco-Clean Certification", issuer: "GreenPro UK · 2024" },
        ].map(c => (
          <div key={c.label} className="bg-card rounded-2xl p-4 border border-border/40 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-full bg-amber-100 flex items-center justify-center"><Award className="w-4 h-4 text-amber-600" /></div>
              <div>
                <div className="font-semibold text-sm text-foreground">{c.label}</div>
                <div className="text-xs text-muted-foreground">{c.issuer}</div>
              </div>
            </div>
            <ChevronRight className="w-4 h-4 text-muted-foreground" />
          </div>
        ))}
        <button className="w-full flex items-center justify-center gap-2 border-2 border-dashed border-border rounded-2xl py-4 text-sm font-medium text-muted-foreground hover:border-primary hover:text-primary transition-colors">
          <Plus className="w-4 h-4" /> Add Certificate
        </button>
      </div>
    </div>
  </div>
);

const ProviderReviewsScreen = ({ onNav }: { onNav: (s: ScreenId) => void }) => (
  <div className="flex flex-col h-full bg-background">
    <StatusBar />
    <BackHeader title="My Reviews" onBack={() => onNav("providerDashboard")} />
    <div className="flex-1 px-4 pb-4 space-y-4 overflow-y-auto" style={{ scrollbarWidth: "none" }}>
      <div className="bg-card rounded-2xl p-5 border border-border/40 flex items-center gap-5">
        <div className="text-center">
          <div className="text-4xl font-extrabold text-foreground" style={{ fontFamily: "Plus Jakarta Sans, sans-serif" }}>4.9</div>
          <Stars v={4.9} size={14} />
          <div className="text-xs text-muted-foreground mt-1">127 reviews</div>
        </div>
        <div className="flex-1 space-y-1">
          {[[5,89],[4,28],[3,7],[2,2],[1,1]].map(([star,count]) => (
            <div key={star} className="flex items-center gap-2">
              <span className="text-[10px] text-muted-foreground w-2">{star}</span>
              <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden"><div className="h-full bg-amber-400 rounded-full" style={{width:`${(count/127)*100}%`}} /></div>
              <span className="text-[10px] text-muted-foreground w-4">{count}</span>
            </div>
          ))}
        </div>
      </div>
      <div className="space-y-3">
        {[
          { name: "Alex J.", date: "2 days ago", rating: 5, text: "Sarah was absolutely fantastic. Left my apartment spotless. Will definitely book again!", replied: false },
          { name: "Maya R.", date: "1 week ago", rating: 5, text: "Punctual, thorough, and very friendly. The eco products smell wonderful.", replied: true, reply: "Thank you so much Maya, it was a pleasure! See you next month 😊" },
          { name: "Chris L.", date: "2 weeks ago", rating: 4, text: "Great job overall. A couple of areas were missed but Sarah came back to fix them, which I appreciated.", replied: false },
        ].map(r => (
          <div key={r.name} className="bg-card rounded-2xl p-4 border border-border/40">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-xs font-bold text-primary">{r.name[0]}</div>
                <div>
                  <div className="text-sm font-semibold text-foreground">{r.name}</div>
                  <div className="text-[10px] text-muted-foreground">{r.date}</div>
                </div>
              </div>
              <Stars v={r.rating} size={11} />
            </div>
            <p className="text-xs text-muted-foreground leading-relaxed mb-3">{r.text}</p>
            {r.replied ? (
              <div className="bg-primary/5 rounded-xl p-3 border-l-2 border-primary">
                <div className="flex items-center gap-1 mb-1"><User className="w-3 h-3 text-primary" /><span className="text-[10px] font-semibold text-primary">Your reply</span></div>
                <p className="text-xs text-muted-foreground">{r.reply}</p>
              </div>
            ) : (
              <button className="text-xs text-primary font-semibold flex items-center gap-1"><MessageSquare className="w-3 h-3" />Reply to review</button>
            )}
          </div>
        ))}
      </div>
    </div>
  </div>
);

// ─── Admin Screens ───────────────────────────────────────────────────────────
const AdminDashboardScreen = ({ onNav }: { onNav: (s: ScreenId) => void }) => (
  <div className="flex flex-col h-full bg-background">
    <div className="bg-slate-900">
      <StatusBar dark />
      <div className="px-5 pb-4 pt-2">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-white/50 text-xs font-medium">EverySkill Admin</p>
            <h1 className="text-xl font-bold text-white" style={{ fontFamily: "Plus Jakarta Sans, sans-serif" }}>Control Panel</h1>
          </div>
          <div className="w-9 h-9 rounded-xl bg-white/10 flex items-center justify-center"><Settings className="w-4 h-4 text-white" /></div>
        </div>
      </div>
    </div>
    <div className="flex-1 px-4 pt-4 pb-4 overflow-y-auto space-y-4" style={{ scrollbarWidth: "none" }}>
      <div className="grid grid-cols-2 gap-2">
        {[
          { label: "Total Users", val: "52,847", trend: "+847 today", color: "text-primary" },
          { label: "Active Providers", val: "8,320", trend: "+124 this week", color: "text-green-600" },
          { label: "Active Bookings", val: "1,204", trend: "↑ 18% MoM", color: "text-amber-600" },
          { label: "Platform Revenue", val: "$94.2K", trend: "+$8.2K this mo.", color: "text-purple-600" },
        ].map(s => (
          <div key={s.label} className="bg-card rounded-2xl p-4 border border-border/40">
            <div className={`text-2xl font-extrabold ${s.color}`} style={{ fontFamily: "Plus Jakarta Sans, sans-serif" }}>{s.val}</div>
            <div className="text-xs font-semibold text-foreground mt-1">{s.label}</div>
            <div className="text-[10px] text-green-600 font-medium mt-0.5">{s.trend}</div>
          </div>
        ))}
      </div>
      <div className="bg-card rounded-2xl border border-border/40 overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-border/50">
          <div className="flex items-center gap-2"><AlertTriangle className="w-4 h-4 text-amber-500" /><h3 className="font-bold text-sm text-foreground" style={{ fontFamily: "Plus Jakarta Sans, sans-serif" }}>Pending KYC Reviews</h3></div>
          <Pill color="orange" sm>12</Pill>
        </div>
        {[
          { name: "GreenThumb Landscaping", type: "Business", submitted: "2 hrs ago" },
          { name: "Derek Morrison", type: "Individual", submitted: "4 hrs ago" },
          { name: "City Plumbing Ltd", type: "Business", submitted: "6 hrs ago" },
        ].map(k => (
          <button key={k.name} onClick={() => onNav("kycReview")} className="w-full flex items-center gap-3 px-4 py-3 border-b border-border/30 hover:bg-background transition-colors">
            <div className="w-9 h-9 rounded-xl bg-amber-100 flex items-center justify-center">{k.type==="Business"?<Building2 className="w-4 h-4 text-amber-600" />:<User className="w-4 h-4 text-amber-600" />}</div>
            <div className="flex-1 text-left">
              <div className="text-sm font-semibold text-foreground">{k.name}</div>
              <div className="text-xs text-muted-foreground">{k.type} · {k.submitted}</div>
            </div>
            <Btn variant="primary" sm onClick={() => onNav("kycReview")}>Review</Btn>
          </button>
        ))}
      </div>
      <div className="bg-card rounded-2xl border border-border/40 overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-border/50">
          <div className="flex items-center gap-2"><Flag className="w-4 h-4 text-destructive" /><h3 className="font-bold text-sm text-foreground" style={{ fontFamily: "Plus Jakarta Sans, sans-serif" }}>Open Disputes</h3></div>
          <Pill color="red" sm>4</Pill>
        </div>
        {[
          { id: "DSP-001", amount: "$85", type: "Refund Request", age: "1 day" },
          { id: "DSP-002", amount: "$220", type: "Quality Dispute", age: "3 days" },
        ].map(d => (
          <button key={d.id} onClick={() => onNav("disputeResolution")} className="w-full flex items-center gap-3 px-4 py-3 border-b border-border/30 hover:bg-background transition-colors">
            <div className="w-9 h-9 rounded-xl bg-red-100 flex items-center justify-center"><AlertTriangle className="w-4 h-4 text-destructive" /></div>
            <div className="flex-1 text-left">
              <div className="text-sm font-semibold text-foreground">{d.id} — {d.amount}</div>
              <div className="text-xs text-muted-foreground">{d.type} · {d.age} old</div>
            </div>
            <ChevronRight className="w-4 h-4 text-muted-foreground" />
          </button>
        ))}
      </div>
    </div>
  </div>
);

const KYCReviewScreen = ({ onNav }: { onNav: (s: ScreenId) => void }) => (
  <div className="flex flex-col h-full bg-background overflow-hidden">
    <StatusBar />
    <BackHeader title="KYC Review" onBack={() => onNav("adminDashboard")} />
    <div className="flex-1 px-4 pb-4 space-y-4 overflow-y-auto" style={{ scrollbarWidth: "none" }}>
      <div className="bg-card rounded-2xl p-4 border border-border/40 flex items-center gap-4">
        <div className="w-14 h-14 rounded-xl bg-primary/10 flex items-center justify-center"><Building2 className="w-7 h-7 text-primary" /></div>
        <div>
          <div className="font-bold text-foreground">GreenThumb Landscaping</div>
          <div className="text-sm text-muted-foreground">Business · Submitted 2 hrs ago</div>
          <Pill color="orange" sm><Clock className="w-2.5 h-2.5" />Pending Review</Pill>
        </div>
      </div>
      <div className="bg-card rounded-2xl p-4 border border-border/40 space-y-3">
        <h3 className="font-bold text-sm text-foreground" style={{ fontFamily: "Plus Jakarta Sans, sans-serif" }}>Submitted Documents</h3>
        <div className="grid grid-cols-2 gap-2">
          {[
            { label: "Business Registration", url: "https://images.unsplash.com/photo-1450101499163-c8848c66ca85?w=200&h=130&fit=crop&auto=format" },
            { label: "Director ID", url: "https://images.unsplash.com/photo-1562592306-02c12e7fe1f8?w=200&h=130&fit=crop&auto=format" },
          ].map(d => (
            <div key={d.label} className="rounded-xl overflow-hidden bg-slate-100">
              <img src={d.url} alt={d.label} className="w-full h-24 object-cover" />
              <div className="px-2 py-1.5 text-[10px] font-medium text-muted-foreground">{d.label}</div>
            </div>
          ))}
        </div>
      </div>
      <div className="bg-card rounded-2xl p-4 border border-border/40 space-y-2">
        <h3 className="font-bold text-sm text-foreground mb-2" style={{ fontFamily: "Plus Jakarta Sans, sans-serif" }}>Verification Checklist</h3>
        {["Business name matches registration", "Director name matches ID", "Address is valid UK postcode", "Company number verified (Companies House)", "No sanctions or adverse media found"].map((item, i) => (
          <div key={item} className="flex items-center gap-3">
            <div className={`w-5 h-5 rounded-full flex items-center justify-center ${i < 3 ? "bg-green-100" : "bg-amber-100"}`}>
              {i < 3 ? <Check className="w-3 h-3 text-green-600" /> : <Clock className="w-3 h-3 text-amber-500" />}
            </div>
            <span className="text-xs text-foreground">{item}</span>
          </div>
        ))}
      </div>
    </div>
    <div className="shrink-0 bg-card border-t border-border p-4 space-y-2">
      <div className="grid grid-cols-3 gap-2">
        <button className="bg-red-50 text-destructive text-sm font-semibold py-2.5 rounded-xl flex items-center justify-center gap-1"><X className="w-4 h-4" />Reject</button>
        <button className="bg-amber-50 text-amber-700 text-sm font-semibold py-2.5 rounded-xl flex items-center justify-center gap-1"><RefreshCw className="w-3.5 h-3.5" />More Info</button>
        <button className="bg-primary text-white text-sm font-semibold py-2.5 rounded-xl flex items-center justify-center gap-1" onClick={() => onNav("adminDashboard")}><Check className="w-4 h-4" />Approve</button>
      </div>
    </div>
  </div>
);

const DisputeResolutionScreen = ({ onNav }: { onNav: (s: ScreenId) => void }) => (
  <div className="flex flex-col h-full bg-background overflow-hidden">
    <StatusBar />
    <BackHeader title="Dispute DSP-001" onBack={() => onNav("adminDashboard")} />
    <div className="flex-1 px-4 pb-4 space-y-4 overflow-y-auto" style={{ scrollbarWidth: "none" }}>
      <div className="bg-red-50 border border-red-100 rounded-2xl p-4 flex items-start gap-3">
        <AlertTriangle className="w-5 h-5 text-destructive shrink-0 mt-0.5" />
        <div>
          <div className="font-semibold text-destructive text-sm">Refund Request · $85.00</div>
          <p className="text-xs text-red-700 mt-1 leading-relaxed">Customer claims the job was not completed to the expected standard. Provider says work was done as agreed.</p>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div className="bg-card rounded-2xl p-3 border border-border/40">
          <div className="text-[10px] font-semibold text-muted-foreground mb-2 uppercase">Customer</div>
          <div className="flex items-center gap-2 mb-2">
            <div className="w-7 h-7 rounded-full bg-blue-100 flex items-center justify-center text-xs font-bold text-blue-600">A</div>
            <span className="text-xs font-semibold">Alex J.</span>
          </div>
          <p className="text-[10px] text-muted-foreground leading-relaxed">{"Kitchen was not cleaned. Oven still dirty. Before photos show clear difference."}</p>
        </div>
        <div className="bg-card rounded-2xl p-3 border border-border/40">
          <div className="text-[10px] font-semibold text-muted-foreground mb-2 uppercase">Provider</div>
          <div className="flex items-center gap-2 mb-2">
            <img src={providers[0].avatar} alt="Sarah" className="w-7 h-7 rounded-full object-cover" />
            <span className="text-xs font-semibold">Sarah C.</span>
          </div>
          <p className="text-[10px] text-muted-foreground leading-relaxed">{"All areas cleaned as agreed. After photos submitted. Customer refused to let me finish."}</p>
        </div>
      </div>
      <div className="bg-card rounded-2xl p-4 border border-border/40">
        <h3 className="font-bold text-sm text-foreground mb-3" style={{ fontFamily: "Plus Jakarta Sans, sans-serif" }}>Evidence</h3>
        <div className="grid grid-cols-3 gap-2">
          {[
            "https://images.unsplash.com/photo-1564540586988-aa4e53c3d799?w=120&h=90&fit=crop&auto=format",
            "https://images.unsplash.com/photo-1584622650111-993a426fbf0a?w=120&h=90&fit=crop&auto=format",
            "https://images.unsplash.com/photo-1556909114-f6e7ad7d3136?w=120&h=90&fit=crop&auto=format",
          ].map((url, i) => (
            <div key={i} className="rounded-xl overflow-hidden bg-slate-100 aspect-video">
              <img src={url} alt={`Evidence ${i}`} className="w-full h-full object-cover" />
            </div>
          ))}
        </div>
      </div>
      <div className="bg-card rounded-2xl p-4 border border-border/40">
        <h3 className="font-bold text-sm text-foreground mb-3" style={{ fontFamily: "Plus Jakarta Sans, sans-serif" }}>Chat Log (Excerpt)</h3>
        <div className="space-y-2">
          {[
            { name: "Alex", text: "The oven is still dirty.", time: "11:42 AM", right: false },
            { name: "Sarah", text: "I cleaned it, I have photos.", time: "11:44 AM", right: true },
            { name: "Alex", text: "I'm raising a dispute.", time: "11:46 AM", right: false },
          ].map((m, i) => (
            <div key={i} className={`flex gap-2 ${m.right ? "flex-row-reverse" : ""}`}>
              <div className="w-5 h-5 rounded-full bg-primary/10 flex items-center justify-center text-[8px] font-bold text-primary shrink-0">{m.name[0]}</div>
              <div className={`flex-1 max-w-[75%] rounded-xl px-3 py-1.5 ${m.right ? "bg-primary/10 text-primary" : "bg-background border border-border"}`}>
                <p className="text-xs text-foreground">{m.text}</p>
                <p className="text-[9px] text-muted-foreground">{m.time}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
    <div className="shrink-0 bg-card border-t border-border p-4 space-y-2">
      <div className="text-xs font-semibold text-muted-foreground mb-1 uppercase tracking-wide">Admin Decision</div>
      <div className="grid grid-cols-3 gap-2">
        <button className="bg-red-50 text-destructive text-xs font-semibold py-3 rounded-xl"><X className="w-4 h-4 mx-auto mb-0.5" />Reject Refund</button>
        <button className="bg-amber-50 text-amber-700 text-xs font-semibold py-3 rounded-xl"><AlertTriangle className="w-4 h-4 mx-auto mb-0.5" />Partial Refund</button>
        <button className="bg-green-50 text-green-700 text-xs font-semibold py-3 rounded-xl" onClick={() => onNav("adminDashboard")}><Check className="w-4 h-4 mx-auto mb-0.5" />Full Refund</button>
      </div>
    </div>
  </div>
);

// ─── Design System Screen ────────────────────────────────────────────────────
const DesignSystemScreen = ({ onNav }: { onNav: (s: ScreenId) => void }) => (
  <div className="flex flex-col h-full bg-background">
    <div style={{ background: "linear-gradient(135deg, #0D3270 0%, #1565C0 100%)" }}>
      <StatusBar dark />
      <div className="px-5 py-3 pb-5">
        <h1 className="text-xl font-bold text-white" style={{ fontFamily: "Plus Jakarta Sans, sans-serif" }}>Design System</h1>
        <p className="text-white/60 text-xs mt-0.5">EverySkill Component Library</p>
      </div>
    </div>
    <div className="flex-1 px-4 py-5 space-y-6 overflow-y-auto" style={{ scrollbarWidth: "none" }}>
      <Section title="Buttons">
        <div className="space-y-2.5">
          <Btn variant="primary" full>Primary Button</Btn>
          <Btn variant="accent" full>Accent / CTA Button</Btn>
          <Btn variant="outline" full>Outline Button</Btn>
          <Btn variant="ghost" full>Ghost Button</Btn>
          <Btn variant="danger" full>Danger Button</Btn>
          <div className="flex gap-2">
            <Btn variant="primary" sm>Small</Btn>
            <Btn variant="accent" sm>CTA Small</Btn>
            <Btn variant="outline" sm>Outline</Btn>
          </div>
        </div>
      </Section>
      <Section title="Status Badges">
        <div className="flex flex-wrap gap-2">
          <Pill color="blue"><CheckCircle className="w-3 h-3" />Verified</Pill>
          <Pill color="gold"><Award className="w-3 h-3" />Top Pro</Pill>
          <Pill color="green"><Check className="w-3 h-3" />Completed</Pill>
          <Pill color="orange"><Clock className="w-3 h-3" />In Progress</Pill>
          <Pill color="purple"><Lock className="w-3 h-3" />Escrow</Pill>
          <Pill color="red"><AlertTriangle className="w-3 h-3" />Disputed</Pill>
          <Pill color="gray">Pending</Pill>
          <Pill color="blue" sm>Small Pill</Pill>
          <Pill color="green" sm>Accepted</Pill>
        </div>
      </Section>
      <Section title="Star Rating">
        <div className="space-y-3 bg-card rounded-2xl p-4 border border-border/40">
          {[5, 4.5, 3, 1].map(r => (
            <div key={r} className="flex items-center gap-3">
              <Stars v={r} size={18} />
              <span className="text-sm font-semibold text-foreground">{r}</span>
            </div>
          ))}
        </div>
      </Section>
      <Section title="Provider Card">
        <ProviderCard p={providers[0]} showWhy />
      </Section>
      <Section title="Input Fields">
        <div className="space-y-3">
          <Input2 label="Email address" placeholder="you@example.com" icon={Mail} />
          <Input2 label="Service location" placeholder="San Francisco, CA" icon={MapPin} />
          <Input2 label="Password" type="password" placeholder="••••••••" icon={Lock} />
        </div>
      </Section>
      <Section title="Booking Status Stepper">
        <div className="bg-card rounded-2xl p-4 border border-border/40">
          <div className="relative">
            <div className="absolute left-[18px] top-2 bottom-2 w-0.5 bg-muted z-0" />
            {["Requested", "Accepted", "Escrow Active", "In Progress", "Complete"].map((s, i) => (
              <div key={s} className="flex items-center gap-4 mb-3 last:mb-0 relative z-10">
                <div className={`w-9 h-9 rounded-full flex items-center justify-center border-2 ${i < 2 ? "bg-primary border-primary" : i === 2 ? "bg-purple-500 border-purple-500" : i === 3 ? "bg-amber-500 border-amber-500" : "bg-muted border-muted"}`}>
                  {i < 2 ? <Check className="w-4 h-4 text-white" /> : <div className="w-2 h-2 rounded-full bg-white" />}
                </div>
                <span className={`text-sm font-medium ${i <= 3 ? "text-foreground" : "text-muted-foreground"}`}>{s}</span>
                {i === 3 && <Pill color="orange" sm>Live</Pill>}
              </div>
            ))}
          </div>
        </div>
      </Section>
      <Section title="Empty State">
        <div className="bg-card rounded-2xl p-8 border border-border/40 flex flex-col items-center text-center">
          <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center mb-3"><Package className="w-8 h-8 text-muted-foreground" /></div>
          <div className="font-bold text-foreground mb-1">No bookings yet</div>
          <p className="text-xs text-muted-foreground mb-4">{"You haven't made any bookings. Start by searching for a service."}</p>
          <Btn variant="primary" sm>Find a Service</Btn>
        </div>
      </Section>
      <Section title="Loading State">
        <div className="bg-card rounded-2xl p-4 border border-border/40 space-y-3">
          {[1, 2, 3].map(i => (
            <div key={i} className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-2xl bg-muted animate-pulse" />
              <div className="flex-1 space-y-2">
                <div className="h-3 bg-muted rounded-full animate-pulse w-3/4" />
                <div className="h-2.5 bg-muted rounded-full animate-pulse w-1/2" />
              </div>
            </div>
          ))}
        </div>
      </Section>
      <Section title="Bottom Navigation">
        <div className="bg-card rounded-2xl border border-border/40 overflow-hidden">
          <div className="flex items-center justify-around px-2 py-3">
            {[{ icon: Home, label: "Home", active: true }, { icon: Calendar, label: "Bookings", active: false }, { icon: MessageSquare, label: "Messages", active: false }, { icon: Heart, label: "Saved", active: false }, { icon: User, label: "Profile", active: false }].map(t => {
              const I = t.icon;
              return (
                <div key={t.label} className="flex flex-col items-center gap-0.5 px-2">
                  <I className={`w-5 h-5 ${t.active ? "text-primary" : "text-muted-foreground"}`} />
                  <span className={`text-[9px] font-medium ${t.active ? "text-primary" : "text-muted-foreground"}`}>{t.label}</span>
                  {t.active && <div className="w-1 h-1 rounded-full bg-primary" />}
                </div>
              );
            })}
          </div>
        </div>
      </Section>
      <Section title="Color Palette">
        <div className="grid grid-cols-4 gap-2">
          {[
            { label: "Primary", bg: "#1565C0" }, { label: "CTA", bg: "#F97316" },
            { label: "Success", bg: "#22C55E" }, { label: "Danger", bg: "#DC2626" },
            { label: "Warning", bg: "#F59E0B" }, { label: "Muted", bg: "#64748B" },
            { label: "Background", bg: "#F0F4F8", text: true }, { label: "Card", bg: "#FFFFFF", text: true },
          ].map(c => (
            <div key={c.label}>
              <div className="aspect-square rounded-xl border border-border/40 shadow-sm" style={{ background: c.bg }} />
              <div className="text-[9px] text-muted-foreground mt-1 text-center">{c.label}</div>
            </div>
          ))}
        </div>
      </Section>
      <div className="h-4" />
    </div>
  </div>
);

const Section = ({ title, children }: { title: string; children: React.ReactNode }) => (
  <div>
    <div className="flex items-center gap-2 mb-3">
      <h3 className="font-bold text-sm text-foreground" style={{ fontFamily: "Plus Jakarta Sans, sans-serif" }}>{title}</h3>
      <div className="flex-1 h-px bg-border" />
    </div>
    {children}
  </div>
);

// ─── Quote Waiting Screen ────────────────────────────────────────────────────
const QuoteWaitingScreen = ({ onNav }: { onNav: (s: ScreenId) => void }) => {
  const { quotePhotos } = React.useContext(QuoteContext);
  return (
    <div className="flex flex-col h-full bg-background overflow-hidden">
      <StatusBar />
      <div className="flex-1 overflow-y-auto px-5 py-6 space-y-5" style={{ scrollbarWidth: "none" }}>
        <div className="flex flex-col items-center text-center pt-4 pb-2">
          <div className="w-24 h-24 rounded-full bg-amber-50 flex items-center justify-center mb-4 shadow-lg shadow-amber-100">
            <div className="w-16 h-16 rounded-full bg-amber-100 flex items-center justify-center">
              <Clock className="w-9 h-9 text-amber-500" />
            </div>
          </div>
          <Pill color="orange"><RefreshCw className="w-3 h-3" />Awaiting Estimate</Pill>
          <h1 className="text-2xl font-bold text-foreground mt-3" style={{ fontFamily: "Plus Jakarta Sans, sans-serif" }}>Request Sent!</h1>
          <p className="text-muted-foreground text-sm mt-1 leading-relaxed max-w-xs">
            Sarah Chen has received your photos and job details. {"She'll"} send back a price estimate shortly.
          </p>
        </div>

        {/* Progress tracker */}
        <div className="bg-card rounded-2xl p-5 border border-border/40">
          <h3 className="font-semibold text-sm text-foreground mb-4 text-center" style={{ fontFamily: "Plus Jakarta Sans, sans-serif" }}>Quote Flow Status</h3>
          <div className="space-y-3">
            {[
              { label: "Photos submitted", done: true, desc: `${quotePhotos.length || 3} photo${(quotePhotos.length || 3) !== 1 ? "s" : ""} uploaded` },
              { label: "Waiting for estimate", active: true, desc: "Sarah is reviewing your job" },
              { label: "Review & accept quote", done: false, desc: "You approve the final price" },
              { label: "Escrow payment", done: false, desc: "Funds held securely" },
              { label: "Job complete", done: false, desc: "Release payment when done" },
            ].map((step, i) => (
              <div key={i} className="flex items-start gap-3">
                <div className={`w-7 h-7 rounded-full flex items-center justify-center shrink-0 mt-0.5 ${step.done ? "bg-primary" : step.active ? "bg-amber-400" : "bg-muted"}`}>
                  {step.done ? <Check className="w-3.5 h-3.5 text-white" /> : step.active ? <div className="w-2 h-2 rounded-full bg-white animate-pulse" /> : <div className="w-1.5 h-1.5 rounded-full bg-muted-foreground/30" />}
                </div>
                <div>
                  <div className={`text-sm font-semibold ${step.done || step.active ? "text-foreground" : "text-muted-foreground"}`}>{step.label}</div>
                  <div className="text-xs text-muted-foreground">{step.desc}</div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Submitted photos preview */}
        {quotePhotos.length > 0 && (
          <div className="bg-card rounded-2xl p-4 border border-border/40">
            <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">Your submitted photos</div>
            <div className="flex gap-2 overflow-x-auto" style={{ scrollbarWidth: "none" }}>
              {quotePhotos.map((url, i) => (
                <div key={i} className="w-20 h-20 rounded-xl overflow-hidden shrink-0">
                  <img src={url} alt="" className="w-full h-full object-cover" />
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="bg-primary/5 border border-primary/10 rounded-2xl p-4 flex items-start gap-3">
          <Bell className="w-5 h-5 text-primary shrink-0 mt-0.5" />
          <p className="text-sm text-primary leading-relaxed">
            <strong>{"You'll"} get notified</strong> the moment Sarah sends her estimate. Most providers respond within 2 hours.
          </p>
        </div>

        <div className="space-y-2">
          <Btn variant="outline" full onClick={() => onNav("chat")}>
            <MessageSquare className="w-4 h-4" /> Message Sarah directly
          </Btn>
          <Btn variant="ghost" full onClick={() => onNav("customerHome")}>Back to Home</Btn>
        </div>
      </div>
    </div>
  );
};

// ─── Provider Billing History Screen ────────────────────────────────────────
const ProviderBillingScreen = ({ onNav }: { onNav: (s: ScreenId) => void }) => {
  const billingData = [
    { id: "#ES-4829", customer: "Alex Johnson", service: "Deep Clean", date: "14 Mar 2025", gross: 120, fee: 15, net: 105, status: "paid" as const },
    { id: "#ES-4801", customer: "Jordan Taylor", service: "Move-Out Clean", date: "10 Mar 2025", gross: 180, fee: 22.5, net: 157.5, status: "paid" as const },
    { id: "#ES-4788", customer: "Emma Williams", service: "Regular Clean", date: "7 Mar 2025", gross: 90, fee: 11.25, net: 78.75, status: "paid" as const },
    { id: "#ES-4762", customer: "Chris Lee", service: "Deep Clean", date: "3 Mar 2025", gross: 120, fee: 15, net: 105, status: "paid" as const },
    { id: "#ES-4740", customer: "Priya Patel", service: "Regular Clean", date: "28 Feb 2025", gross: 90, fee: 11.25, net: 78.75, status: "paid" as const },
    { id: "#ES-4718", customer: "Sam Morgan", service: "Move-Out Clean", date: "22 Feb 2025", gross: 180, fee: 22.5, net: 157.5, status: "pending" as const },
  ];
  const totalGross = billingData.reduce((s, b) => s + b.gross, 0);
  const totalFees = billingData.reduce((s, b) => s + b.fee, 0);
  const totalNet = billingData.reduce((s, b) => s + b.net, 0);
  return (
    <div className="flex flex-col h-full bg-background overflow-hidden">
      <StatusBar />
      <BackHeader title="Billing History" onBack={() => onNav("providerDashboard")} />
      <div className="flex-1 overflow-y-auto" style={{ scrollbarWidth: "none" }}>
        {/* Summary cards */}
        <div className="px-4 pt-4 pb-3 space-y-3">
          <div className="bg-primary rounded-2xl p-5">
            <div className="text-white/70 text-xs font-medium mb-1">Total Earned (all time)</div>
            <div className="text-3xl font-extrabold text-white mb-1" style={{ fontFamily: "Plus Jakarta Sans, sans-serif" }}>${totalNet.toFixed(2)}</div>
            <div className="text-white/60 text-xs">After platform fees</div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="bg-card rounded-2xl p-4 border border-border/40">
              <div className="text-xs text-muted-foreground mb-1">Gross Revenue</div>
              <div className="text-xl font-bold text-foreground" style={{ fontFamily: "Plus Jakarta Sans, sans-serif" }}>${totalGross.toFixed(2)}</div>
              <div className="text-[10px] text-muted-foreground mt-0.5">{billingData.length} bookings</div>
            </div>
            <div className="bg-card rounded-2xl p-4 border border-border/40">
              <div className="text-xs text-muted-foreground mb-1">Platform Fees</div>
              <div className="text-xl font-bold text-destructive" style={{ fontFamily: "Plus Jakarta Sans, sans-serif" }}>–${totalFees.toFixed(2)}</div>
              <div className="text-[10px] text-muted-foreground mt-0.5">12.5% per booking</div>
            </div>
          </div>
        </div>

        {/* Transaction list */}
        <div className="px-4 pb-4">
          <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">All Transactions</div>
          <div className="space-y-2">
            {billingData.map(b => (
              <div key={b.id} className="bg-card rounded-2xl p-4 border border-border/40">
                <div className="flex items-start justify-between mb-2">
                  <div>
                    <div className="font-semibold text-sm text-foreground">{b.customer}</div>
                    <div className="text-xs text-muted-foreground">{b.service} · {b.date}</div>
                    <div className="text-[10px] text-muted-foreground font-mono mt-0.5">{b.id}</div>
                  </div>
                  <Pill color={b.status === "paid" ? "green" : "orange"} sm>{b.status === "paid" ? "Paid" : "Pending"}</Pill>
                </div>
                <div className="flex items-center gap-0 bg-background rounded-xl overflow-hidden">
                  <div className="flex-1 py-2 px-3 text-center">
                    <div className="text-[10px] text-muted-foreground">Charged</div>
                    <div className="text-sm font-bold text-foreground">${b.gross.toFixed(2)}</div>
                  </div>
                  <div className="w-px h-8 bg-border" />
                  <div className="flex-1 py-2 px-3 text-center">
                    <div className="text-[10px] text-muted-foreground">Platform fee</div>
                    <div className="text-sm font-bold text-destructive">–${b.fee.toFixed(2)}</div>
                  </div>
                  <div className="w-px h-8 bg-border" />
                  <div className="flex-1 py-2 px-3 text-center">
                    <div className="text-[10px] text-muted-foreground">You earned</div>
                    <div className="text-sm font-bold text-green-600">${b.net.toFixed(2)}</div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

// ─── Screen Registry ─────────────────────────────────────────────────────────
const screens: Record<ScreenId, React.FC<{ onNav: (s: ScreenId) => void }>> = {
  splash: SplashScreen, login: LoginScreen, signup: SignupScreen,
  providerOnboarding: ProviderOnboardingScreen, verificationPending: VerificationPendingScreen,
  customerHome: CustomerHomeScreen, aiSearch: AISearchScreen, filters: AISearchScreen,
  providerProfile: ProviderProfileScreen, serviceDetail: ServiceDetailScreen,
  bookingRequest: BookingRequestScreen, payment: PaymentScreen,
  bookingConfirmation: BookingConfirmationScreen, quoteWaiting: QuoteWaitingScreen, bookingDetail: BookingDetailScreen,
  chat: ChatScreen, notifications: NotificationsScreen, review: ReviewScreen,
  customerDashboard: CustomerDashboardScreen,
  providerDashboard: ProviderDashboardScreen, providerListings: ProviderListingsScreen,
  createListing: CreateListingScreen, providerCalendar: ProviderCalendarScreen,
  bookingInbox: BookingInboxScreen, providerCertificates: ProviderCertificatesScreen,
  providerReviews: ProviderReviewsScreen, providerBilling: ProviderBillingScreen,
  adminDashboard: AdminDashboardScreen, kycReview: KYCReviewScreen,
  disputeResolution: DisputeResolutionScreen,
  designSystem: DesignSystemScreen,
};

const flowConfig: { id: FlowId; label: string; screens: ScreenId[] }[] = [
  {
    id: "onboarding", label: "Onboarding",
    screens: ["splash", "signup", "login", "providerOnboarding", "verificationPending"],
  },
  {
    id: "customer", label: "Customer",
    screens: ["customerHome", "aiSearch", "providerProfile", "serviceDetail", "bookingRequest", "quoteWaiting", "payment", "bookingConfirmation", "bookingDetail", "chat", "notifications", "review", "customerDashboard"],
  },
  {
    id: "provider", label: "Provider",
    screens: ["providerDashboard", "providerListings", "createListing", "providerCalendar", "bookingInbox", "providerCertificates", "providerReviews", "providerBilling"],
  },
  {
    id: "admin", label: "Admin",
    screens: ["adminDashboard", "kycReview", "disputeResolution"],
  },
  {
    id: "designSystem", label: "Design System",
    screens: ["designSystem"],
  },
];

const screenLabels: Partial<Record<ScreenId, string>> = {
  splash: "Welcome", login: "Log In", signup: "Sign Up",
  providerOnboarding: "Provider KYC", verificationPending: "Verification Pending",
  customerHome: "Home Feed", aiSearch: "AI Search Results",
  providerProfile: "Provider Profile", serviceDetail: "Service Detail",
  bookingRequest: "Booking Request", payment: "Payment (Escrow)",
  bookingConfirmation: "Booking Confirmed", bookingDetail: "Booking Detail",
  chat: "In-App Chat", notifications: "Notifications",
  review: "Rate & Review", customerDashboard: "Customer Dashboard",
  providerDashboard: "Provider Dashboard", providerListings: "Service Listings",
  createListing: "Create Listing", providerCalendar: "Availability Calendar",
  bookingInbox: "Booking Requests", providerCertificates: "Trust & Verification",
  providerReviews: "Reviews Received", providerBilling: "Billing History",
  quoteWaiting: "Awaiting Estimate",
  adminDashboard: "Admin Panel", kycReview: "KYC Review", disputeResolution: "Dispute Resolution",
  designSystem: "Design System",
};

// ─── Main App ────────────────────────────────────────────────────────────────
export default function App() {
  const [currentFlow, setCurrentFlow] = useState<FlowId>("onboarding");
  const [currentScreen, setCurrentScreen] = useState<ScreenId>("splash");
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [userRole, setUserRole] = useState<UserRole>(null);
  const [authGate, setAuthGate] = useState<{ screen: ScreenId; reason: string } | null>(null);

  // Quote flow state (shared across screens via context)
  const [quoteStatus, setQuoteStatus] = useState<QuoteStatus>("none");
  const [quotePhotos, setQuotePhotos] = useState<string[]>([]);
  const [quoteData, setQuoteData] = useState<QuoteData>(null);

  // Toast / notification state
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const [notifLog, setNotifLog] = useState<ToastItem[]>([]);
  const toastIdRef = React.useRef(0);

  const pushToast = useCallback((t: Omit<ToastItem, "id">) => {
    const id = ++toastIdRef.current;
    const item = { ...t, id };
    setToasts(prev => [...prev.slice(-2), item]);
    setNotifLog(prev => [item, ...prev.slice(0, 49)]);
  }, []);

  const dismissToast = useCallback((id: number) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  }, []);

  const login = (role: UserRole) => {
    setIsLoggedIn(true); setUserRole(role);
    pushToast({ title: "Welcome back!", body: "You're now signed in.", icon: CheckCircle, color: "text-green-600", bg: "bg-green-50" });
  };
  const logout = () => { setIsLoggedIn(false); setUserRole(null); };

  const flow = flowConfig.find(f => f.id === currentFlow)!;
  const currentIdx = flow.screens.indexOf(currentScreen);

  const rawNavigate = (screenId: ScreenId) => {
    const targetFlow = flowConfig.find(f => f.screens.includes(screenId));
    if (targetFlow && targetFlow.id !== currentFlow) {
      setCurrentFlow(targetFlow.id);
    }
    setCurrentScreen(screenId);
  };

  const navigate = (screenId: ScreenId) => {
    if (!isLoggedIn && PROTECTED.includes(screenId)) {
      setAuthGate({ screen: screenId, reason: GATE_REASON[screenId] || "Sign in to continue." });
      return;
    }
    rawNavigate(screenId);
  };

  const goNext = () => {
    const idx = flow.screens.indexOf(currentScreen);
    if (idx < flow.screens.length - 1) setCurrentScreen(flow.screens[idx + 1]);
  };

  const goPrev = () => {
    const idx = flow.screens.indexOf(currentScreen);
    if (idx > 0) setCurrentScreen(flow.screens[idx - 1]);
  };

  const switchFlow = (fid: FlowId) => {
    setCurrentFlow(fid);
    setCurrentScreen(flowConfig.find(f => f.id === fid)!.screens[0]);
  };

  const CurrentScreen = screens[currentScreen];

  return (
    <QuoteContext.Provider value={{ quoteStatus, quotePhotos, quoteData, setQuoteStatus, setQuotePhotos, setQuoteData }}>
    <ToastContext.Provider value={{ toasts, push: pushToast, dismiss: dismissToast, notifLog }}>
    <AuthContext.Provider value={{ isLoggedIn, userRole, login, logout }}>
    <div
      className="min-h-screen flex flex-col items-center overflow-auto"
      style={{
        background: "linear-gradient(135deg, #06142A 0%, #0D2447 40%, #0A1E3C 70%, #08162F 100%)",
        backgroundAttachment: "fixed",
      }}
    >
      {/* Ambient glows */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <div className="absolute top-1/4 -left-32 w-96 h-96 rounded-full opacity-15" style={{ background: "radial-gradient(circle, #1565C0, transparent 70%)" }} />
        <div className="absolute bottom-1/4 -right-32 w-96 h-96 rounded-full opacity-10" style={{ background: "radial-gradient(circle, #F97316, transparent 70%)" }} />
      </div>

      {/* Header */}
      <header className="relative z-10 w-full flex items-center justify-between px-6 py-4 max-w-2xl mx-auto">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-xl bg-primary flex items-center justify-center shadow-lg shadow-primary/40">
            <Zap className="w-4 h-4 text-white" />
          </div>
          <span className="text-lg font-extrabold text-white" style={{ fontFamily: "Plus Jakarta Sans, sans-serif" }}>
            Every<span style={{ color: "#F97316" }}>Skill</span>
          </span>
          <span className="text-white/30 text-xs font-medium ml-1">UI Prototype</span>
        </div>
        <div className="text-white/30 text-xs font-medium hidden sm:block">28 Screens · 5 Flows</div>
      </header>

      {/* Flow tabs */}
      <nav className="relative z-10 flex gap-1 bg-white/5 rounded-2xl p-1 mb-6 mx-4 border border-white/10 backdrop-blur-sm flex-wrap justify-center">
        {flowConfig.map(f => (
          <button
            key={f.id}
            onClick={() => switchFlow(f.id)}
            className={`px-4 py-2 rounded-xl text-sm font-semibold transition-all ${currentFlow === f.id ? "bg-primary text-white shadow-md shadow-primary/30" : "text-white/50 hover:text-white/80"}`}
          >
            {f.label}
          </button>
        ))}
      </nav>

      {/* Phone frame */}
      <div className="relative z-10 flex justify-center">
        <div
          className="relative bg-black rounded-[52px] overflow-hidden"
          style={{
            width: 393, height: 852,
            boxShadow: "0 0 0 2px #2a2a2a, 0 0 0 5px #111, 0 40px 100px rgba(0,0,0,0.6), inset 0 0 0 1px rgba(255,255,255,0.05)",
          }}
        >
          {/* Side buttons */}
          <div className="absolute -left-[3px] top-28 w-[3px] h-8 bg-[#2a2a2a] rounded-l-sm" />
          <div className="absolute -left-[3px] top-44 w-[3px] h-12 bg-[#2a2a2a] rounded-l-sm" />
          <div className="absolute -left-[3px] top-60 w-[3px] h-12 bg-[#2a2a2a] rounded-l-sm" />
          <div className="absolute -right-[3px] top-40 w-[3px] h-20 bg-[#2a2a2a] rounded-r-sm" />
          {/* Screen inner */}
          <div
            className="absolute bg-white overflow-hidden"
            style={{ inset: 2, borderRadius: 50 }}
          >
            <div className="w-full h-full overflow-hidden relative">
              <CurrentScreen onNav={navigate} />
              {/* Toast banners */}
              {toasts.length > 0 && (
                <ToastBanner
                  key={toasts[toasts.length - 1].id}
                  toast={toasts[toasts.length - 1]}
                  onDismiss={() => dismissToast(toasts[toasts.length - 1].id)}
                  onTap={() => {
                    const t = toasts[toasts.length - 1];
                    dismissToast(t.id);
                    if (t.screen) navigate(t.screen);
                  }}
                />
              )}
              {authGate && (
                <AuthGateModal
                  reason={authGate.reason}
                  onLogin={() => { setAuthGate(null); rawNavigate("login"); }}
                  onSignup={() => { setAuthGate(null); rawNavigate("signup"); }}
                  onDismiss={() => setAuthGate(null)}
                />
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Screen nav */}
      <div className="relative z-10 flex flex-col items-center gap-3 mt-6 mb-8">
        <div className="text-white/50 text-xs font-semibold uppercase tracking-wider">
          {screenLabels[currentScreen] || currentScreen}
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={goPrev}
            disabled={currentIdx <= 0}
            className="w-9 h-9 rounded-full bg-white/10 flex items-center justify-center disabled:opacity-30 hover:bg-white/20 transition-colors"
          >
            <ChevronLeft className="w-4 h-4 text-white" />
          </button>
          <div className="flex gap-1.5 flex-wrap justify-center max-w-xs">
            {flow.screens.map((s, i) => (
              <button
                key={s}
                onClick={() => setCurrentScreen(s)}
                className={`transition-all rounded-full ${s === currentScreen ? "w-4 h-2 bg-primary" : "w-2 h-2 bg-white/25 hover:bg-white/40"}`}
                title={screenLabels[s]}
              />
            ))}
          </div>
          <button
            onClick={goNext}
            disabled={currentIdx >= flow.screens.length - 1}
            className="w-9 h-9 rounded-full bg-white/10 flex items-center justify-center disabled:opacity-30 hover:bg-white/20 transition-colors"
          >
            <ChevronRight className="w-4 h-4 text-white" />
          </button>
        </div>
        <div className="text-white/25 text-[10px]">
          {currentIdx + 1} of {flow.screens.length} in {flow.label} flow
        </div>
      </div>

      {/* Quick nav links */}
      <div className="relative z-10 flex flex-wrap gap-2 justify-center px-4 mb-8 max-w-lg">
        <div className="w-full text-center text-white/30 text-[10px] font-semibold uppercase tracking-wider mb-1">End-to-End Flow: Search → Book → Pay → Complete → Review</div>
        {(["customerHome", "aiSearch", "providerProfile", "serviceDetail", "bookingRequest", "payment", "bookingConfirmation", "bookingDetail", "chat", "review"] as ScreenId[]).map(s => (
          <button
            key={s}
            onClick={() => navigate(s)}
            className={`text-[10px] px-2.5 py-1 rounded-full font-medium transition-all border ${s === currentScreen ? "bg-primary border-primary text-white" : "border-white/10 text-white/40 hover:border-white/30 hover:text-white/60"}`}
          >
            {screenLabels[s]}
          </button>
        ))}
      </div>
    </div>
    </AuthContext.Provider>
    </ToastContext.Provider>
    </QuoteContext.Provider>
  );
}
