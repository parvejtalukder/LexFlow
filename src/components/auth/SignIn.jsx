'use client';

import useAuth from '@/hooks/useAuth';
import useAxiosSecure from '@/hooks/useAxiosSecure';
import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import toast from 'react-hot-toast';
import { FcGoogle } from 'react-icons/fc';
import { FiEye, FiEyeOff } from 'react-icons/fi';

export default function SignIn({ onSwitchToSignUp }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const from = searchParams.get('from') || '/dashboard';

  const { signInUser, goWithGoogle, deactivated } = useAuth();
  const axiosSecure = useAxiosSecure();

  const [authError, setAuthError] = useState('');
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  useEffect(() => {
    if (!deactivated) return;
    const id = setTimeout(() => {
      setAuthError('User Deactivated. This account has been closed.');
      toast.error('User Deactivated.');
    }, 0);
    return () => clearTimeout(id);
  }, [deactivated]);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm({
    defaultValues: {
      email: '',
      password: '',
    },
  });

  const onSubmit = async (data) => {
    setAuthError('');
    setLoading(true);

    const toastId = toast.loading('Signing in...');

    try {
      const res = await signInUser(data.email, data.password);
      toast.success(`Welcome back, ${res.user?.displayName || 'User'}!`, { id: toastId });
      setTimeout(() => {}, 1000);
      setTimeout(() => {
          router.push(from);
        }, 500);
    } catch (err) {
      console.error('Sign-In Error:', err);
      let errorMessage = 'Invalid email or password.';

      if (err.code === 'auth/invalid-credential' || err.code === 'auth/user-not-found') {
        errorMessage = 'Invalid email or password.';
      } else if (err.code === 'auth/wrong-password') {
        errorMessage = 'Incorrect password. Please try again.';
      } else if (err.message) {
        errorMessage = err.message;
      }

      setAuthError(errorMessage);
      toast.error(errorMessage, { id: toastId });
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleSignIn = async () => {
    setAuthError('');
    const toastId = toast.loading('Signing in with Google...');

    try {
      const result = await goWithGoogle();
      const gUser = result.user;

      const googleUserPayload = {
        uid: gUser.uid,
        fullName: gUser.displayName || 'Google User',
        email: gUser.email ? gUser.email.toLowerCase() : '',
        photoURL: gUser.photoURL || null,
      };

      await axiosSecure.post('/api/users/signup', googleUserPayload);

      toast.success(`Signed in as ${gUser.displayName || gUser.email}`, { id: toastId });
      setTimeout(() => {
        router.push(from);
      }, 500);
    } catch (err) {
      console.error('Google Sign-In Error:', err);
      if (err?.response?.status === 409 || err?.response?.data?.message?.includes('exists')) {
        toast.success(`Signed in as Google User`, { id: toastId });
        setTimeout(() => {
          router.push(from);
        }, 500);
        return;
      }

      const errorMsg = err?.response?.data?.error || err?.message || 'Google sign-in failed.';
      setAuthError(errorMsg);
      toast.error(errorMsg, { id: toastId });
    }
  };

  return (
    <aside className="w-full max-w-md px-6 py-8 text-slate-100 font-sans">
      <div className="mb-8">
        <h2 className="text-3xl font-serif font-bold text-[#080B1A] tracking-wide">
          Welcome Back
        </h2>
        <p className="text-sm text-slate-400 mt-1">
          Sign in to your LexFlow dashboard.
        </p>
      </div>

      {authError && (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-600">
          {authError}
        </div>
      )}

      <button
        type="button"
        onClick={handleGoogleSignIn}
        className="w-full flex items-center justify-center gap-3 py-3 px-4 rounded-xl bg-[#080B1A] hover:bg-slate-800/60 text-sm text-slate-200 font-medium transition-colors"
      >
        <FcGoogle className="text-xl" />
        Sign in with Google
      </button>

      <div className="flex items-center my-6 gap-3">
        <div className="h-[1px] bg-slate-800 flex-1" />
        <span className="text-xs uppercase tracking-widest text-slate-500 font-medium">Or</span>
        <div className="h-[1px] bg-slate-800 flex-1" />
      </div>

      <form onSubmit={handleSubmit(onSubmit)} autoComplete="off" className="space-y-4">
        <input type="text" name="fake-username" style={{ display: 'none' }} tabIndex={-1} />
        <input type="password" name="fake-password" style={{ display: 'none' }} tabIndex={-1} />

        <div className="bg-slate-800/40 rounded-lg p-3">
          <label className="block text-xs font-medium text-[#080B1A] uppercase tracking-wider mb-1">
            Work Email
          </label>
          <input
            type="email"
            placeholder="jdoe@lawfirm.com"
            {...register('email', {
              required: 'Email is required',
              pattern: {
                value: /^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$/i,
                message: 'Invalid email address',
              },
            })}
            className="w-full bg-transparent text-sm text-slate-900 placeholder-slate-700 focus:outline-none"
          />
          {errors.email && (
            <span className="text-[10px] text-red-400 mt-1 block">{errors.email.message}</span>
          )}
        </div>

        <div className="bg-slate-800/40 rounded-lg p-3 relative">
          <label className="block text-xs font-medium text-[#080B1A] uppercase tracking-wider mb-1">
            Password
          </label>

          <div className="relative flex items-center">
            <input
              type={showPassword ? 'text' : 'password'}
              placeholder="*******"
              {...register('password', {
                required: 'Password is required',
              })}
              className="w-full bg-transparent text-sm text-slate-900 placeholder-slate-700 focus:outline-none pr-8"
            />

            <button
              type="button"
              onClick={() => setShowPassword((prev) => !prev)}
              className="absolute right-0 text-slate-700 hover:text-[#080B1A] transition-colors focus:outline-none"
              aria-label={showPassword ? 'Hide password' : 'Show password'}
            >
              {showPassword ? (
                <FiEyeOff className="text-base" />
              ) : (
                <FiEye className="text-base" />
              )}
            </button>
          </div>

          {errors.password && (
            <span className="text-[10px] text-red-400 mt-1 block">{errors.password.message}</span>
          )}
        </div>

        <button
          type="submit"
          disabled={loading}
          className="w-full mt-4 py-3 bg-[#080B1A] hover:bg-[#080B1A]/90 text-slate-150 font-semibold text-sm rounded-xl transition-colors shadow-lg disabled:opacity-50"
        >
          {loading ? 'Signing In...' : 'Sign In'}
        </button>
      </form>

      <div className="mt-8 text-center text-xs text-slate-400">
        {"Don't have an account?"}{' '}
        <button
          type="button"
          onClick={onSwitchToSignUp}
          className="text-[#080B1A] font-semibold hover:underline ml-1"
        >
          Create Account
        </button>
      </div>
    </aside>
  );
}