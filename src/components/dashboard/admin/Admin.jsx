"use client";

import React, { useState, useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import {
  Home,
  Users,
  UserRound,
  ChevronDown,
  ChevronsRight,
  Moon,
  Sun,
  Bell,
  Settings,
  HelpCircle,
  User,
  Briefcase,
  Inbox,
  CreditCard,
  MessageSquareWarning,
  Wallet,
  KeyRound,
  ShieldCheck,
  TrendingUp,
} from "lucide-react";
import useAuth from "@/hooks/useAuth";
import DashboardSkeleton from "@/templates/loader/DashboardSkeleton";
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
  "/dashboard/my-earnings": ["My Earnings", "Your handler share of every approved payment."],
  "/dashboard/my-profile": ["My Profile", "Your personal, professional and account details."],
  "/dashboard/wallet": ["Wallet", "Earnings, profit splits, withdrawals and available balances."],
};

function getSectionInfo(pathname) {
  return (
    SECTION_INFO[pathname] || [
      pathname?.split("/").pop()?.replace(/-/g, " ") || "Dashboard",
      "This section is under construction.",
    ]
  );
}

export default function DashboardShell({ children }) {
  const [isDark, setIsDark] = useState(false);
  const { role, user, loading, logOut } = useAuth();
  const pathname = usePathname();

  useEffect(() => {
    if (isDark) {
      document.documentElement.classList.add("dark");
    } else {
      document.documentElement.classList.remove("dark");
    }
  }, [isDark]);

  if (loading) {
    return <DashboardSkeleton />;
  }

  const [heading, description] = getSectionInfo(pathname);

  return (
    <div className={`flex h-screen w-full overflow-hidden ${isDark ? "dark" : ""}`}>
      <div className="flex h-full w-full bg-gray-50 dark:bg-gray-950 text-gray-900 dark:text-gray-100">
        <Sidebar role={role} user={user} pathname={pathname} />

        <div className="flex-1 bg-gray-50 dark:bg-gray-950 p-6 overflow-y-auto">
          <div className="flex items-center justify-between mb-8">
            <div>
              <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100">
                {heading}
              </h1>
              <p className="text-gray-600 dark:text-gray-400 mt-1">{description}</p>
            </div>
            <div className="flex items-center gap-4">
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
              <button className="relative p-2 rounded-lg bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100 transition-colors">
                <Bell className="h-5 w-5" />
                <span className="absolute -top-1 -right-1 h-3 w-3 bg-red-500 rounded-full"></span>
              </button>
              <button
                onClick={() => setIsDark(!isDark)}
                className="flex h-10 w-10 items-center justify-center rounded-lg border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800 hover:text-gray-900 dark:hover:text-gray-100 transition-colors"
              >
                {isDark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
              </button>
              <button className="p-2 rounded-lg bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100 transition-colors">
                <LuLogOut onClick={() => {
                  toast.success("Logged Out!");
                  logOut();
                }} className="h-5 w-5" />
              </button>
            </div>
          </div>

          {children}
        </div>
      </div>
    </div>
  );
}

const Sidebar = ({ role, user, pathname }) => {
  const [open, setOpen] = useState(true);

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
        { Icon: TrendingUp, title: "My Earnings", href: "/dashboard/my-earnings" },
        { Icon: Inbox, title: "My Requests", href: "/dashboard/my-requests" },
        { Icon: MessageSquareWarning, title: "My Complaints", href: "/dashboard/my-complaints" },
        { Icon: UserRound, title: "My Profile", href: "/dashboard/my-profile" },
      ];

  const accountItems = [
    { Icon: Wallet, title: "Wallet", href: "/dashboard/wallet" },
    { Icon: Settings, title: "Settings", href: "/dashboard/settings" },
    { Icon: KeyRound, title: "Password Reset", href: "/dashboard/password-reset" },
    { Icon: HelpCircle, title: "Help", href: "/dashboard/help" },
  ];

  return (
    <nav
      className={`relative flex h-full flex-col shrink-0 border-r transition-all duration-300 ease-in-out ${
        open ? "w-64" : "w-16"
      } border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-2 shadow-sm`}
    >
      <TitleSection open={open} user={user} role={role} />

      <div className="flex-1 overflow-y-auto">

      {open && (
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
            open={open}
          />
        ))}
      </div>

      {open && (
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
              open={open}
            />
          ))}
        </div>
      )}

      </div>

      <ToggleClose open={open} setOpen={setOpen} />
    </nav>
  );
};

const Option = ({ Icon, title, href, active, open }) => {
  const router = useRouter();

  return (
    <button
      onClick={() => router.push(href)}
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
          <Logo photo={user?.photoURL} />
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

