'use client'; // Required when using React hooks in App Router

import React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation'; // 1. Import useRouter
import { GoLaw } from 'react-icons/go';
import { FiHome, FiArrowLeft } from 'react-icons/fi';

const NotFound = () => {
  const router = useRouter(); // 2. Initialize router

  const handleGoBack = () => {
    router.back(); // 3. Triggers browser history back
  };

  return (
    <div className="min-h-dvh bg-slate-950 flex flex-col items-center justify-center p-4 text-center sm:p-6 relative overflow-hidden">
      {/* Decorative background glow */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[350px] h-[350px] bg-amber-500/10 rounded-full blur-3xl pointer-events-none" />

      <div className="relative z-10 max-w-md w-full flex flex-col items-center">
        {/* Animated Icon Container */}
        <div className="relative flex items-center justify-center  ">
          <div className="w-20 h-20 border-2 border-slate-800 border-t-amber-500 rounded-full animate-spin" />
          <div className="absolute p-3 bg-slate-900/90 rounded-full border border-slate-800 shadow-xl">
            <GoLaw className="text-3xl text-amber-500" />
          </div>
        </div>

        {/* Header */}
        <h1 className="text-6xl sm:text-7xl font-serif font-extrabold text-transparent bg-clip-text bg-gradient-to-b from-slate-100 to-slate-400 tracking-wider mb-2">
          404
        </h1>

        {/* <h2 className="mt-3 text-xl font-serif text-slate-200 tracking-wide">
          Case File Not Found
        </h2> */}

        <p className="mt-2 text-sm text-slate-400 max-w-xs leading-relaxed">
          The page or legal record you are trying to access does not exist or has been moved.
        </p>

        {/* Action Buttons */}
        <div className="mt-8 flex flex-col sm:flex-row items-center justify-center gap-3 w-full">
          {/* Go Back Button */}
          <button
            onClick={handleGoBack}
            type="button"
            className="w-full sm:w-auto flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl border border-slate-800 bg-slate-900/60 hover:bg-slate-800 text-xs font-medium text-slate-300 transition-colors cursor-pointer"
          >
            <FiArrowLeft className="text-sm" />
            Go Back
          </button>

          {/* Return Home Link */}
          <Link
            href="/"
            className="w-full sm:w-auto flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-semibold text-xs transition-colors shadow-lg shadow-amber-500/10"
          >
            <FiHome className="text-sm" />
            Return Home
          </Link>
        </div>
      </div>
    </div>
  );
};

export default NotFound;