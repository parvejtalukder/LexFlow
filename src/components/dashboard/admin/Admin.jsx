"use client";

import React, { useState, useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import {
  Home,
  Users,
  UserRound,
  ChevronDown,
  ChevronsRight,
  RefreshCw,
  HelpCircle,
  User,
  Briefcase,
  Banknote,
  History,
  Inbox,
  CreditCard,
  MessageSquareWarning,
  Wallet,
  KeyRound,
  ShieldCheck,
  TrendingUp,
  Menu,
  X,
} from "lucide-react";
import useAuth from "@/hooks/useAuth";
import DashboardSkeleton from "@/templates/loader/DashboardSkeleton";
import Spinner from "@/components/ui/Spinner";
import Image from "next/image";
import { LuLogOut } from "react-icons/lu";
import toast from "react-hot-toast";

const SECTION_INFO = {
  "/dashboard": ["Dashboard", "Welcome back to your dashboard"],
  "/dashboard/users": ["Users", "Manage all registered users of the firm."],
  "/dashboard/cases": ["All Cases", "Review, approve or reject every case handled by the firm."],
  "/dashboard/requests": ["Requests", "Review caseworker applications."],
  "/dashboard/payments": ["All Payments", "Review, approve and void payments submitted by case handlers."],
  "/dashboard/my-cases": ["My Cases", "Cases assigned to you, with their documents and approval status."],
  "/dashboard/my-payments": ["My Payments", "Submit a payment for approval and track its status."],
  "/dashboard/my-profile": ["My Profile", "Your personal, professional and account details."],
  "/dashboard/wallet": ["Wallet", "Your available balance and where the firm's money sits."],
  "/dashboard/earnings-by-case": ["Earnings by Case", "What every case billed and how the net was distributed."],
  "/dashboard/earnings-by-caseworker": ["Earnings by Caseworker", "Handler share, branch splits and payouts per caseworker."],
  "/dashboard/withdrawal-requests": ["Withdrawal Requests", "Review, approve, pay and reverse every payout request."],
  "/dashboard/activity-history": ["Transaction History", "Every earning, payout and payment, with statements."],
  "/dashboard/complaints": ["Complaints", "Every complaint filed by the team, with review actions."],
  "/dashboard/my-complaints": ["My Complaints", "File a complaint and follow its outcome."],
  "/dashboard/password-reset": ["Password Reset", "Send yourself a secure link to choose a new password."],
  "/dashboard/help": ["Help", "How to reach the administrator."],
};

function getSectionInfo(pathname) {
  const exact = SECTION_INFO[pathname];
  if (exact) return exact;

  // Detail routes (/dashboard/users/<uid>, /dashboard/cases/<id>) should keep the
  // heading of the collection they belong to, so the longest matching parent
  // prefix wins.
  const parent = Object.keys(SECTION_INFO)
    .filter((path) => pathname?.startsWith(`${path}/`))
    .sort((a, b) => b.length - a.length)[0];
  if (parent) return SECTION_INFO[parent];

  return [
    pathname?.split("/").pop()?.replace(/-/g, " ") || "Dashboard",
    "This section is under construction.",
  ];
}

export default function DashboardShell({ children }) {
  const [navOpen, setNavOpen] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const { role, user, loading, logOut } = useAuth();
  const pathname = usePathname();

  // The dashboard runs in dark mode permanently: the `dark` class is rendered on
  // <html> by the root layout, so it is present before first paint instead of
  // being toggled on after hydration (which flashed light on every load).

  /**
   * Refresh the page's data.
   *
   * Every dashboard list is fetched client-side over axios (useWalletData,
   * useTransactions, the tables, ...), so a reload is what actually refetches
   * them - router.refresh() would only re-render the server components. The
   * short delay exists so the spinner is visible before the page goes away.
   */
  const handleRefresh = () => {
    if (refreshing) return;
    setRefreshing(true);
    window.setTimeout(() => window.location.reload(), 150);
  };

  // The mobile drawer must never survive a route change. Adjusting state during
  // render (instead of inside an effect) avoids a cascading re-render.
  const [previousPathname, setPreviousPathname] = useState(pathname);
  if (previousPathname !== pathname) {
    setPreviousPathname(pathname);
    setNavOpen(false);
  }

  // Body scroll lock + Escape-to-close while the drawer is open.
  useEffect(() => {
    if (!navOpen) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKeyDown = (event) => {
      if (event.key === "Escape") setNavOpen(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [navOpen]);

  if (loading) {
    return <DashboardSkeleton />;
  }

  const [heading, description] = getSectionInfo(pathname);

  return (
    <div className="flex min-h-dvh w-full lg:h-screen lg:overflow-hidden">
      <div className="flex min-h-dvh w-full bg-gray-50 dark:bg-gray-950 text-gray-900 dark:text-gray-100 lg:h-full">
        <Sidebar
          role={role}
          user={user}
          pathname={pathname}
          className="hidden lg:flex"
        />
        <MobileNav
          open={navOpen}
          onClose={() => setNavOpen(false)}
          role={role}
          user={user}
          pathname={pathname}
        />

        <div className="flex-1 min-w-0 bg-gray-50 dark:bg-gray-950 p-4 sm:p-6 lg:overflow-y-auto">
          <div className="flex flex-col gap-4 mb-6 sm:mb-8">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-3 min-w-0">
                <button
                  type="button"
                  onClick={() => setNavOpen(true)}
                  aria-label="Open navigation"
                  aria-expanded={navOpen}
                  className="lg:hidden -ml-1 grid size-10 shrink-0 place-content-center rounded-lg border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800 hover:text-gray-900 dark:hover:text-gray-100 transition-colors"
                >
                  <Menu className="h-5 w-5" />
                </button>
                <div className="min-w-0">
                  <h1 className="truncate text-xl font-bold text-gray-900 dark:text-gray-100 sm:text-2xl lg:text-3xl">
                    {heading}
                  </h1>
                  <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">{description}</p>
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0 sm:gap-4">
                {role && (
                  <span
                    className={`hidden sm:inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold border ${
                      String(role).toLowerCase() === "admin"
                        ? "bg-indigo-50 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300 border-indigo-200 dark:border-indigo-800"
                        : "bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 border-gray-200 dark:border-gray-700"
                    }`}
                  >
                    {String(role).toLowerCase() === "admin" ? (
                      <ShieldCheck className="h-3.5 w-3.5" />
                    ) : (
                      <UserRound className="h-3.5 w-3.5" />
                    )}
                    {String(role).charAt(0).toUpperCase() + String(role).slice(1)}
                  </span>
                )}
                <button
                  type="button"
                  onClick={handleRefresh}
                  disabled={refreshing}
                  aria-label="Refresh page data"
                  title="Refresh"
                  className="flex h-10 w-10 items-center justify-center rounded-lg border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800 hover:text-gray-900 dark:hover:text-gray-100 transition-colors disabled:opacity-60"
                >
                  {refreshing ? <Spinner size={18} /> : <RefreshCw className="h-5 w-5" />}
                </button>
                <button className="p-2 rounded-lg bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100 transition-colors">
                  <LuLogOut onClick={() => {
                    toast.success("Logged Out!");
                    logOut();
                  }} className="h-5 w-5" />
                </button>
              </div>
            </div>
          </div>

          {children}
        </div>
      </div>
    </div>
  );
}

const MobileNav = ({ open, onClose, role, user, pathname }) => {
  return (
    <div
      inert={!open}
      aria-hidden={!open}
      className={`lg:hidden fixed inset-0 z-50 ${open ? "" : "pointer-events-none"}`}
    >
      <div
        onClick={onClose}
        className={`absolute inset-0 bg-black/60 backdrop-blur-sm transition-opacity duration-300 ${
          open ? "opacity-100" : "opacity-0"
        }`}
      />

      <aside
        role="dialog"
        aria-modal="true"
        aria-label="Navigation"
        className={`relative z-10 flex h-full w-64 max-w-[88vw] flex-col bg-white dark:bg-gray-900 shadow-2xl transition-transform duration-300 ease-out ${
          open ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="flex shrink-0 items-center justify-between border-b border-gray-200 dark:border-gray-800 px-3 py-2">
          <span className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
            Menu
          </span>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close navigation"
            className="grid size-9 place-content-center rounded-lg text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex-1 min-h-0">
          <Sidebar
            role={role}
            user={user}
            pathname={pathname}
            forceOpen
            onNavigate={onClose}
          />
        </div>
      </aside>
    </div>
  );
};

const Sidebar = ({ role, user, pathname, forceOpen = false, onNavigate, className = "" }) => {
  const [open, setOpen] = useState(true);

  // The mobile drawer always renders fully expanded and has no collapse toggle.
  const expanded = forceOpen || open;

  const isAdmin = String(role || "").trim().toLowerCase() === "admin";

  const mainItems = isAdmin
    ? [
        { Icon: Home, title: "Dashboard", href: "/dashboard" },
        { Icon: Users, title: "All Users", href: "/dashboard/users" },
        { Icon: Briefcase, title: "All Cases", href: "/dashboard/cases" },
        { Icon: Inbox, title: "All Requests", href: "/dashboard/requests" },
        { Icon: CreditCard, title: "All Payments", href: "/dashboard/payments" },
        { Icon: MessageSquareWarning, title: "All Complaints", href: "/dashboard/complaints" },
        { Icon: UserRound, title: "My Profile", href: "/dashboard/my-profile" },
      ]
    : [
        { Icon: Home, title: "Dashboard", href: "/dashboard" },
        { Icon: Briefcase, title: "My Cases", href: "/dashboard/my-cases" },
        { Icon: CreditCard, title: "My Payments", href: "/dashboard/my-payments" },
        // { Icon: TrendingUp, title: "Earnings by Case", href: "/dashboard/earnings-by-case" },
        // { Icon: History, title: "Activity History", href: "/dashboard/activity-history" },
        // { Icon: Inbox, title: "My Requests", href: "/dashboard/my-requests" },
        { Icon: MessageSquareWarning, title: "My Complaints", href: "/dashboard/my-complaints" },
        { Icon: UserRound, title: "My Profile", href: "/dashboard/my-profile" },
      ];

  // The wallet section is shared, but the two roles reach different slices of
  // it: admins review the firm's payouts and per-caseworker earnings, a
  // caseworker sees their own earnings per case and their activity timeline.
  const accountItems = [
    
    { Icon: Wallet, title: isAdmin ? "Wallet" : "My Wallet", href: "/dashboard/wallet" },
    ...(isAdmin
      ? [
          { Icon: History, title: "Transaction History", href: "/dashboard/activity-history" },
        ]
        : [
          { Icon: TrendingUp, title: "Earnings", href: "/dashboard/earnings-by-case" },
          { Icon: History, title: "Transaction History", href: "/dashboard/activity-history" },
        ]),
    { Icon: KeyRound, title: "Password Reset", href: "/dashboard/password-reset" },
    { Icon: HelpCircle, title: "Help", href: "/dashboard/help" },
  ];
  return (
    <nav
      className={`relative flex h-full flex-col shrink-0 border-r transition-all duration-300 ease-in-out ${
        forceOpen ? "w-full" : expanded ? "w-64" : "w-16"
      } border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-2 shadow-sm ${className}`}
    >
      <TitleSection open={expanded} user={user} role={role} />

      <div className="flex-1 overflow-y-auto">

      {expanded && (
        <div className="px-3 py-2 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">
          {isAdmin ? "Administration" : "Caseworker"}
        </div>
      )}

      <div className="space-y-1 mb-8">
        {mainItems.map(({ Icon, title, href }) => (
          <Option
            key={title}
            Icon={Icon}
            title={title}
            href={href}
            active={pathname === href}
            open={expanded}
            onSelect={onNavigate}
          />
        ))}
      </div>

      {expanded && (
        <div className="border-t border-gray-200 dark:border-gray-800 pt-4 space-y-1">
          <div className="px-3 py-2 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">
            Account
          </div>
          {accountItems.map(({ Icon, title, href }) => (
            <Option
              key={title}
              Icon={Icon}
              title={title}
              href={href}
              active={pathname === href}
              open={expanded}
              onSelect={onNavigate}
            />
          ))}
        </div>
      )}

      </div>

      {!forceOpen && <ToggleClose open={expanded} setOpen={setOpen} />}
    </nav>
  );
};

const Option = ({ Icon, title, href, active, open, onSelect }) => {
  const router = useRouter();

  return (
    <button
      onClick={() => {
        router.push(href);
        onSelect?.();
      }}
      aria-current={active ? "page" : undefined}
      className={`relative flex h-11 w-full items-center rounded-md transition-all duration-200 ${
        active
          ? "bg-blue-50 dark:bg-blue-900/50 text-blue-700 dark:text-blue-300 shadow-sm border-l-2 border-blue-500"
          : "text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800 hover:text-gray-900 dark:hover:text-gray-200"
      }`}
    >
      <div className="grid h-full w-12 place-content-center">
        <Icon className="h-4 w-4" />
      </div>

      {open && (
        <span
          className={`text-sm font-medium transition-opacity duration-200 ${
            open ? "opacity-100" : "opacity-0"
          }`}
        >
          {title}
        </span>
      )}
    </button>
  );
};


const TitleSection = ({ open, user, role }) => {
  const displayName = user?.displayName || "LexFlow User";
  const roleLabel =
    role === "admin"
      ? "Administrator"
      : role === "attorney"
      ? "Attorney"
      : role === "caseworker"
      ? "Caseworker"
      : role
      ? role.charAt(0).toUpperCase() + role.slice(1)
      : "Unassigned";

  return (
    <div className="mb-6 border-b border-gray-200 dark:border-gray-800 pb-4">
      <div className="flex cursor-pointer items-center justify-between rounded-md p-2 transition-colors hover:bg-gray-50 dark:hover:bg-gray-800">
        <div className="flex items-center gap-3">
          {/* <Logo photo={user?.photoURL} /> */}
          {open && (
            <div className={`transition-opacity duration-200 ${open ? "opacity-100" : "opacity-0"}`}>
              <div className="flex items-center gap-2">
                <div className="min-w-0">
                  <span className="block text-sm font-semibold text-gray-900 dark:text-gray-100 truncate">
                    {displayName}
                  </span>
                  <span className="block text-xs text-gray-500 dark:text-gray-400 capitalize">
                    {roleLabel}
                  </span>
                </div>
              </div>
            </div>
          )}
        </div>
        {open && <ChevronDown className="h-4 w-4 text-gray-400 dark:text-gray-500" />}
      </div>
    </div>
  );
};

const Logo = ({ photo }) => {
  return (
    <div className="grid size-10 shrink-0 place-content-center rounded-lg bg-gradient-to-br from-blue-500 to-blue-600 shadow-sm">
      {photo ? (
        <Image
          src={photo}
          width={40}
          height={40}
          alt="Photo"
          className="size-10 rounded-lg object-cover"
        />
      ) : (
        <span className="text-white font-semibold">
          U
        </span>
      )}
    </div>
  );
};

const ToggleClose = ({ open, setOpen }) => {
  return (
    <button
      onClick={() => setOpen(!open)}
      className="shrink-0 border-t border-gray-200 dark:border-gray-800 transition-colors hover:bg-gray-50 dark:hover:bg-gray-800"
    >
      <div className="flex items-center p-3">
        <div className="grid size-10 place-content-center">
          <ChevronsRight
            className={`h-4 w-4 transition-transform duration-300 text-gray-500 dark:text-gray-400 ${
              open ? "rotate-180" : ""
            }`}
          />
        </div>
        {open && (
          <span
            className={`text-sm font-medium text-gray-600 dark:text-gray-300 transition-opacity duration-200 ${
              open ? "opacity-100" : "opacity-0"
            }`}
          >
            Hide
          </span>
        )}
      </div>
    </button>
  );
};

