'use client';

import useAuth from '@/hooks/useAuth';
import useAxiosSecure from '@/hooks/useAxiosSecure';
import { useRouter, useSearchParams } from 'next/navigation';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import toast from 'react-hot-toast';
import { FcGoogle } from 'react-icons/fc';
import { FiEye, FiEyeOff } from 'react-icons/fi';

export default function SignUp({ onSwitchToSignIn }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const from = searchParams.get('from') || '/dashboard';

  const { registerUser, updateUser, goWithGoogle, role } = useAuth();
  const axiosSecure = useAxiosSecure();

  const [authError, setAuthError] = useState('');
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm({
    defaultValues: {
      fullName: '',
      email: '',
      password: '',
    },
  });

  const onSubmit = async (data) => {
    setAuthError('');
    setLoading(true);

    const toastId = toast.loading('Creating account...');

    try {
      
      const registerRes = await registerUser(data.email, data.password);
      const firebaseUser = registerRes.user;

      if (updateUser) {
        await updateUser({ displayName: data.fullName });
      }

      const userPayload = {
        uid: firebaseUser.uid,
        fullName: data.fullName,
        email: data.email.toLowerCase(),
        photoURL: firebaseUser.photoURL || null,
      };

      const res = await axiosSecure.post('/api/users/signup', userPayload);

      if (res.status === 201 || res.status === 200 || res.data?.success || res.data?.insertedId) {
        toast.success(res.data?.message || 'Application submitted! Pending Admin review.', { id: toastId });
        
        if (onSwitchToSignIn) {
          onSwitchToSignIn();
        } else {
          setTimeout(() => {}, 1000);
          setTimeout(() => {
            router.push(from);
          }, [500])
        }
      } else {
        throw new Error(res.data?.error || 'Failed to register application record.');
      }
    } catch (err) {
      console.error('Sign-Up Error:', err);
      const errorMessage =
        err?.response?.data?.error || err?.response?.data?.message || err?.message || 'Registration failed. Please try again.';
      setAuthError(errorMessage);
      toast.error(errorMessage, { id: toastId });
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleSignUp = async () => {
    setAuthError('');
    const toastId = toast.loading('Signing up with Google...');

    try {
      const result = await goWithGoogle();
      const gUser = result.user;

      const googleUserPayload = {
        uid: gUser.uid,
        fullName: gUser.displayName || 'Google User',
        email: gUser.email.toLowerCase(),
        photoURL: gUser.photoURL || null,
      };

      const res = await axiosSecure.post('/api/users/signup', googleUserPayload);

      if (res.status === 201 || res.status === 200 || res.data?.success || res.data?.insertedId) {
        toast.success(res.data?.message || 'Google sign-up successful! Pending Admin review.', { id: toastId });
        
        if (onSwitchToSignIn) {
          onSwitchToSignIn();
        } else {
          setTimeout(() => {}, 1000);
          setTimeout(() => {
            router.push(from);
          }, [500])
        }
      } else {
        throw new Error(res.data?.error || 'Failed to process Google sign-up.');
      }
    } catch (err) {
      console.error('Google Sign-Up Error:', err);
      const errorMsg = err?.response?.data?.error || err?.message || 'Google sign-up failed.';
      setAuthError(errorMsg);
      toast.error(errorMsg, { id: toastId });
    }
  };

  return (
    <aside className="w-full max-w-md px-6 py-8 text-slate-100 font-sans">
      <div className="mb-8">
        <h2 className="text-3xl font-serif font-bold text-[#080B1A] tracking-wide">
          Join LexFlow
        </h2>
        <p className="text-sm text-slate-400 mt-1">
          Create an account to manage legal cases and operations.
        </p>
      </div>

      {/* Google Sign-In Button */}
      <button
        type="button"
        onClick={handleGoogleSignUp}
        className="w-full flex items-center justify-center gap-3 py-3 px-4 rounded-xl bg-[#080B1A] hover:bg-slate-800/60 text-sm text-slate-200 font-medium transition-colors"
      >
        <FcGoogle className="text-xl" />
        Sign up with Google
      </button>

      <div className="flex items-center my-6 gap-3">
        <div className="h-[1px] bg-slate-800 flex-1" />
        <span className="text-xs uppercase tracking-widest text-slate-500 font-medium">Or</span>
        <div className="h-[1px] bg-slate-800 flex-1" />
      </div>

      <form onSubmit={handleSubmit(onSubmit)} autoComplete="off" className="space-y-4">
        {/* Anti-Autofill Dummy Inputs */}
        <input type="text" name="fake-username" style={{ display: 'none' }} tabIndex={-1} />
        <input type="password" name="fake-password" style={{ display: 'none' }} tabIndex={-1} />

        {/* Full Name Input */}
        <div className="bg-slate-800/40 rounded-lg p-3">
          <label className="block text-xs font-medium text-[#080B1A] uppercase tracking-wider mb-1">
            Full Name
          </label>
          <input
            type="text"
            placeholder="Jane Doe, Esq."
            {...register('fullName', { required: 'Full name is required' })}
            className="w-full bg-transparent text-sm text-slate-900 placeholder-slate-700 focus:outline-none"
          />
          {errors.fullName && (
            <span className="text-[10px] text-red-400 mt-1 block">{errors.fullName.message}</span>
          )}
        </div>

        {/* Email & Password Grid */}
        <div className="grid grid-cols-2 gap-3">
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
                placeholder="••••••••••••"
                {...register('password', {
                  required: 'Password is required',
                  minLength: {
                    value: 6,
                    message: 'Min length is 6 characters',
                  },
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
              <span className="text-[10px] text-red-400 mt-1 block">
                {errors.password.message}
              </span>
            )}
          </div>
        </div>

        <button
          type="submit"
          disabled={loading}
          className="w-full mt-4 py-3 bg-[#080B1A] hover:bg-[#080B1A]/90 text-slate-150 font-semibold text-sm rounded-xl transition-colors shadow-lg disabled:opacity-50"
        >
          {loading ? 'Creating Account...' : 'Create Account'}
        </button>
      </form>

      {/* Switcher */}
      <div className="mt-8 text-center text-xs text-slate-400">
        Already have an account?{' '}
        <button
          type="button"
          onClick={onSwitchToSignIn}
          className="text-[#080B1A] font-semibold hover:underline ml-1"
        >
          Sign In
        </button>
      </div>
    </aside>
  );
}