'use client';

import React, { useState, useEffect } from 'react';
import useAxiosSecure from '@/hooks/useAxiosSecure';
import useAuth from '@/hooks/useAuth';
import toast from 'react-hot-toast';
import { useRouter } from 'next/navigation';
import { IoArrowForward, IoTimeOutline, IoCheckmarkCircleOutline, IoShieldCheckmarkOutline, IoCloseCircleOutline } from 'react-icons/io5';
import { BiCloudUpload, BiCheck, BiUser, BiFile } from 'react-icons/bi';
import { GoLaw } from 'react-icons/go';
import { LuLogOut } from 'react-icons/lu';
import ApplicationSkeleton from '@/templates/loader/ApplicationSkeleton';
import MediaLibrary from '@/components/media/MediaLibrary';

const Applicant = ({ user: dbUser }) => {
  const router = useRouter();
  const axiosSecure = useAxiosSecure();
  const { user: firebaseUser, logOut, role, accountStatus, loading, updateUser } = useAuth();

  const [currentStep, setCurrentStep] = useState(1);
  const [submitting, setSubmitting] = useState(false);
  const [mediaPicker, setMediaPicker] = useState(null);
  
  // Track application state.
  // - role 'applicant' or a pending (non-user) account → Under Review screen.
  // - accountStatus 'REJECTED' → Rejected screen (handled below).
  // - role 'user' / UNREGISTERED → still needs to complete the multi-step form.
  const [isSubmitted, setIsSubmitted] = useState(
    role === 'applicant' ||
    (accountStatus === 'PENDING' && role !== 'user')
  );
  const isRejected = accountStatus === 'REJECTED';
  const [resubmitting, setResubmitting] = useState(false);
  const [resubmitted, setResubmitted] = useState(false);

  const initialPhoto = firebaseUser?.photoURL || dbUser?.photoURL || '';

  const [formData, setFormData] = useState({
    fullName: firebaseUser?.displayName || dbUser?.fullName || '',
    email: firebaseUser?.email || dbUser?.email || '',
    phone: dbUser?.phone || '',
    address: dbUser?.address || '',
    jobTitle: dbUser?.jobTitle || '',
    registrationNumber: dbUser?.registrationNumber || '',
    photoURL: initialPhoto,
    photoFileId: '',
    idCardUrl: '',
    idCardFileId: '',
    licenseDocUrl: '',
    licenseDocFileId: '',
  });

  const [fileNames, setFileNames] = useState({
    idCard: '',
    licenseDoc: '',
  });

  const handleInputChange = (e) => {
    const { id, value } = e.target;
    setFormData((prev) => ({ ...prev, [id]: value }));
  };

  // Open the central media library for a given target.
  const openMediaLibrary = (target) => setMediaPicker(target);

  // Called when the user selects a file inside the media library.
  const handleMediaSelect = async (file) => {
    if (mediaPicker === 'avatar') {
      let previewUrl = file.url;
      if ((file.mimeType || '').startsWith('image/')) {
        try {
          const res = await axiosSecure.get(file.url, { responseType: 'blob' });
          previewUrl = URL.createObjectURL(res.data);
        } catch {
          previewUrl = file.url;
        }
      }
      setFormData((prev) => ({ ...prev, photoURL: previewUrl, photoFileId: file.id }));

      // Keep the Firebase Auth profile photo in sync as well.
      if (updateUser) {
        try {
          await updateUser({ photoURL: file.url });
        } catch (err) {
          console.error('Failed to sync photo to Firebase Auth:', err);
        }
      }

      toast.success('Profile photo selected.');
    } else if (mediaPicker === 'idCard') {
      setFormData((prev) => ({ ...prev, idCardUrl: file.url, idCardFileId: file.id }));
      setFileNames((prev) => ({ ...prev, idCard: file.fileName }));
      toast.success('Government ID attached.');
    } else if (mediaPicker === 'licenseDoc') {
      setFormData((prev) => ({ ...prev, licenseDocUrl: file.url, licenseDocFileId: file.id }));
      setFileNames((prev) => ({ ...prev, licenseDoc: file.fileName }));
      toast.success('Practice license attached.');
    }
    setMediaPicker(null);
  };

  const handleNext = () => {
    if (currentStep === 1 && (!formData.fullName || !formData.email || !formData.phone)) {
      toast.error('Please complete all mandatory personal info fields.');
      return;
    }
    if (currentStep === 2 && (!formData.jobTitle || !formData.registrationNumber)) {
      toast.error('Please complete all credential fields.');
      return;
    }
    setCurrentStep((prev) => Math.min(prev + 1, 3));
  };

  const handleBack = () => setCurrentStep((prev) => Math.max(prev - 1, 1));

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!formData.idCardUrl || !formData.licenseDocUrl) {
      toast.error('Please upload both required verification documents.');
      return;
    }

    setSubmitting(true);
    const toastId = toast.loading('Submitting caseworker application...');

    try {
      const payload = {
        uid: firebaseUser?.uid,
        fullName: formData.fullName,
        email: formData.email,
        phone: formData.phone,
        address: formData.address,
        jobTitle: formData.jobTitle,
        registrationNumber: formData.registrationNumber,
        // Only send a public (http) photo URL; blob previews are not persisted.
        photoURL:
          formData.photoURL && formData.photoURL.startsWith('http')
            ? formData.photoURL
            : null,
        photoFileId: formData.photoFileId || null,
        idCardUrl: formData.idCardUrl,
        licenseDocUrl: formData.licenseDocUrl,
        idCardFileId: formData.idCardFileId || null,
        licenseDocFileId: formData.licenseDocFileId || null,
      };

      const res = await axiosSecure.patch('/api/users/application', payload);

      if (res.data?.success || res.status === 200) {
        toast.success('Application submitted! Now pending admin review.', { id: toastId });
        setIsSubmitted(true);
        setResubmitting(false);
        setResubmitted(true);
      }
    } catch (err) {
      console.error(err);
      toast.error(err?.response?.data?.error || 'Failed to submit application.', { id: toastId });
    } finally {
      setSubmitting(false);
    }
  };

  // Safety net: authorized users (admins / approved caseworkers) should never
  // see the application flow — kick them back to the real dashboard.
  const isAuthorizedUser =
    role === 'admin' ||
    (role === 'caseworker' && accountStatus === 'ACTIVE');

  useEffect(() => {
    if (loading) return;
    if (isAuthorizedUser) {
      router.replace('/dashboard');
    }
  }, [loading, isAuthorizedUser, router]);

  // Show a skeleton of the application page while auth/role data is loading.
  // (Placed after all hooks so hook order stays consistent every render.)
  if (loading) {
    return <ApplicationSkeleton />;
  }

  return (
    <div className="min-h-screen bg-[#F8FAFC] flex flex-col font-sans text-[#1b1b1d]">
      {/* Sticky Top Navbar */}
      <header className="w-full bg-[#080B1A] border-b border-slate-800 py-4 px-6 md:px-12 flex items-center justify-between sticky top-0 z-50 shadow-md">
        <div className="flex items-center gap-2">
          <GoLaw className="text-2xl text-white" />
          <span className="text-xl font-serif font-bold text-white tracking-wide">LexFlow</span>
          <span className="hidden sm:inline-block ml-3 px-2.5 py-0.5 text-[10px] font-bold tracking-widest uppercase bg-slate-800 text-slate-300 rounded-full border border-slate-700">
            Caseworker Portal
          </span>
        </div>

        {firebaseUser && (
          <div className="flex items-center gap-3">
            <div className="text-right hidden sm:block">
              <p className="text-xs font-semibold text-slate-200">{formData.fullName || firebaseUser.email}</p>
              <p className="text-[10px] text-slate-400">{firebaseUser.email}</p>
            </div>
            {formData.photoURL ? (
              <img src={formData.photoURL} alt="Avatar" className="w-8 h-8 rounded-full border border-slate-700 object-cover" />
            ) : (
              <div className="w-8 h-8 rounded-full bg-blue-600 text-white flex items-center justify-center font-bold text-xs">
                {(formData.fullName || firebaseUser.email || 'U').charAt(0).toUpperCase()}
              </div>
            )}
            <button onClick={() => {
              logOut();
              toast.success("Logged Out!")
            }} className='text-white text-2xl hover:text-white/40 transition-all duration-150'><LuLogOut></LuLogOut></button>
          </div>
        )}
      </header>

      {/* Main Content Container */}
      <main className="w-full max-w-[1200px] mx-auto py-10 px-4 sm:px-8 flex-1 flex flex-col items-center justify-center">
        
        {/* =========================================
            STATE A: APPLICATION SUBMITTED / UNDER REVIEW
           ========================================= */}
        {/* =========================================
            STATE R: APPLICATION REJECTED
           ========================================= */}
        {isRejected && !resubmitting && !resubmitted ? (
          <div className="w-full max-w-2xl bg-white border border-slate-200 p-8 sm:p-12 rounded-2xl shadow-sm text-center">
            <div className="w-16 h-16 bg-red-500/10 border border-red-500/20 text-red-600 rounded-full flex items-center justify-center mx-auto mb-6">
              <IoCloseCircleOutline className="text-3xl" />
            </div>

            <span className="px-3 py-1 bg-red-100 text-red-800 text-[10px] font-bold tracking-widest uppercase rounded-full border border-red-200">
              Account Status: Rejected
            </span>

            <h1 className="text-2xl font-serif font-bold text-[#080B1A] mt-4">
              Application Rejected
            </h1>

            <p className="text-sm text-slate-500 mt-2 max-w-md mx-auto leading-relaxed">
              Unfortunately, your application was not approved. Your account is
              restricted from accessing the LexFlow dashboard. If you believe
              this is a mistake, please contact our administration team.
            </p>

            <div className="my-8 p-4 bg-slate-50 rounded-xl border border-slate-200 text-left space-y-3">
              <div className="flex items-center gap-3 text-xs text-slate-700">
                <IoCloseCircleOutline className="text-red-500 text-lg shrink-0" />
                <span>Application reviewed and not approved</span>
              </div>
              <div className="flex items-center gap-3 text-xs text-slate-700">
                <IoCloseCircleOutline className="text-red-500 text-lg shrink-0" />
                <span>Dashboard access has been restricted</span>
              </div>
              <div className="flex items-center gap-3 text-xs text-slate-700">
                <IoShieldCheckmarkOutline className="text-amber-500 text-lg shrink-0" />
                <span>Contact support to discuss a re-application</span>
              </div>
            </div>

            <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
              <button
                type="button"
                onClick={() => setResubmitting(true)}
                className="w-full sm:w-auto px-6 py-2.5 bg-[#080B1A] hover:bg-slate-800 text-white text-xs font-semibold rounded-xl transition-colors shadow-md"
              >
                Resubmit Application
              </button>
              <button
                type="button"
                onClick={() => router.push('/')}
                className="w-full sm:w-auto px-6 py-2.5 bg-white border border-slate-300 text-slate-700 hover:bg-slate-50 text-xs font-semibold rounded-xl transition-colors"
              >
                Return Home
              </button>
              <button
                type="button"
                onClick={logOut}
                className="w-full sm:w-auto px-6 py-2.5 bg-white border border-slate-300 text-slate-700 hover:bg-slate-50 text-xs font-semibold rounded-xl transition-colors"
              >
                Sign Out
              </button>
            </div>
          </div>
        ) : (isSubmitted || resubmitted) && !resubmitting ? (
          <div className="w-full max-w-2xl bg-white border border-slate-200 p-8 sm:p-12 rounded-2xl shadow-sm text-center">
            <div className="w-16 h-16 bg-amber-500/10 border border-amber-500/20 text-amber-600 rounded-full flex items-center justify-center mx-auto mb-6">
              <IoTimeOutline className="text-3xl animate-pulse" />
            </div>

            <span className="px-3 py-1 bg-amber-100 text-amber-800 text-[10px] font-bold tracking-widest uppercase rounded-full border border-amber-200">
              Account Status: Pending Review
            </span>

            <h1 className="text-2xl font-serif font-bold text-[#080B1A] mt-4">
              Your Application is Under Review
            </h1>

            <p className="text-sm text-slate-500 mt-2 max-w-md mx-auto leading-relaxed">
              Thank you for completing your onboarding submission. Our administration team is verifying your registration and credentials.
            </p>

            <div className="my-8 p-4 bg-slate-50 rounded-xl border border-slate-200 text-left space-y-3">
              <div className="flex items-center gap-3 text-xs text-slate-700">
                <IoCheckmarkCircleOutline className="text-emerald-500 text-lg shrink-0" />
                <span>Identity & Contact Details Verified</span>
              </div>
              <div className="flex items-center gap-3 text-xs text-slate-700">
                <IoCheckmarkCircleOutline className="text-emerald-500 text-lg shrink-0" />
                <span>Credentials & SRA Registration Recorded</span>
              </div>
              <div className="flex items-center gap-3 text-xs text-slate-700">
                <IoShieldCheckmarkOutline className="text-amber-500 text-lg shrink-0" />
                <span>Verification Documents Uploaded to VPS Storage</span>
              </div>
            </div>

            <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
              <button
                type="button"
                onClick={() => router.refresh()}
                className="w-full sm:w-auto px-6 py-2.5 bg-[#080B1A] hover:bg-slate-800 text-white text-xs font-semibold rounded-xl transition-colors shadow-md"
              >
                Check Approval Status
              </button>
              <button
                type="button"
                onClick={logOut}
                className="w-full sm:w-auto px-6 py-2.5 bg-white border border-slate-300 text-slate-700 hover:bg-slate-50 text-xs font-semibold rounded-xl transition-colors"
              >
                Sign Out
              </button>
            </div>
          </div>
        ) : (
          /* =========================================
              STATE B: MULTI-STEP APPLICATION FORM
             ========================================= */
          <div className="w-full max-w-3xl">
            <div className="mb-8 text-center">
              <h1 className="text-2xl sm:text-3xl font-serif font-bold text-[#080B1A]">Caseworker Onboarding Application</h1>
              <p className="text-sm text-slate-500 mt-1">Complete the steps below to request operational access to LexFlow.</p>
            </div>

            {/* Stepper Progress Bar Header */}
            <div className="w-full mb-8">
              <div className="flex justify-between items-center relative">
                <div className="absolute top-1/2 left-0 w-full h-[2px] bg-slate-200 -z-10" />
                <div
                  className="absolute top-1/2 left-0 h-[2px] bg-blue-600 -z-10 transition-all duration-300"
                  style={{
                    width: currentStep === 1 ? '0%' : currentStep === 2 ? '50%' : '100%',
                  }}
                />

                {/* Step 1 Indicator */}
                <div className="flex flex-col items-center bg-[#F8FAFC] px-1 sm:px-3">
                  <div
                    className={`w-8 h-8 sm:w-9 sm:h-9 rounded-full flex items-center justify-center mb-1.5 font-semibold text-sm transition-colors ${
                      currentStep > 1
                        ? 'bg-blue-600 text-white'
                        : currentStep === 1
                        ? 'bg-[#080B1A] text-white ring-4 ring-blue-100'
                        : 'bg-white border-2 border-slate-300 text-slate-400'
                    }`}
                  >
                    {currentStep > 1 ? <BiCheck className="text-xl" /> : '1'}
                  </div>
                  <span className={`text-[9px] font-bold tracking-wide uppercase sm:text-[11px] sm:tracking-wider ${currentStep >= 1 ? 'text-[#080B1A]' : 'text-slate-400'}`}>
                    Personal Info
                  </span>
                </div>

                {/* Step 2 Indicator */}
                <div className="flex flex-col items-center bg-[#F8FAFC] px-1 sm:px-3">
                  <div
                    className={`w-8 h-8 sm:w-9 sm:h-9 rounded-full flex items-center justify-center mb-1.5 font-semibold text-sm transition-colors ${
                      currentStep > 2
                        ? 'bg-blue-600 text-white'
                        : currentStep === 2
                        ? 'bg-[#080B1A] text-white ring-4 ring-blue-100'
                        : 'bg-white border-2 border-slate-300 text-slate-400'
                    }`}
                  >
                    {currentStep > 2 ? <BiCheck className="text-xl" /> : '2'}
                  </div>
                  <span className={`text-[9px] font-bold tracking-wide uppercase sm:text-[11px] sm:tracking-wider ${currentStep >= 2 ? 'text-[#080B1A]' : 'text-slate-400'}`}>
                    Credentials
                  </span>
                </div>

                {/* Step 3 Indicator */}
                <div className="flex flex-col items-center bg-[#F8FAFC] px-1 sm:px-3">
                  <div
                    className={`w-8 h-8 sm:w-9 sm:h-9 rounded-full flex items-center justify-center mb-1.5 font-semibold text-sm transition-colors ${
                      currentStep === 3
                        ? 'bg-[#080B1A] text-white ring-4 ring-blue-100'
                        : 'bg-white border-2 border-slate-300 text-slate-400'
                    }`}
                  >
                    3
                  </div>
                  <span className={`text-[9px] font-bold tracking-wide uppercase sm:text-[11px] sm:tracking-wider ${currentStep === 3 ? 'text-[#080B1A]' : 'text-slate-400'}`}>
                    Documents
                  </span>
                </div>
              </div>
            </div>

            {/* Form Card */}
            <div className="w-full bg-white border border-slate-200 p-6 sm:p-10 rounded-2xl shadow-sm">
              
              {/* STEP 1: Personal Info & Avatar */}
              {currentStep === 1 && (
                <div className="space-y-6">
                  <div className="border-b pb-3">
                    <h2 className="text-xl font-bold text-[#080B1A]">Personal Details</h2>
                    <p className="text-xs text-slate-500 mt-0.5">Verify your identity and primary work contact details.</p>
                  </div>

                  {/* Profile Photo Display / Upload */}
                  <div className="flex items-center gap-4 p-4 bg-slate-50 rounded-xl border border-slate-200">
                    {formData.photoURL ? (
                      <img
                        src={formData.photoURL}
                        alt="Profile"
                        className="w-16 h-16 rounded-full object-cover border-2 border-slate-300"
                      />
                    ) : (
                      <div className="w-16 h-16 rounded-full bg-slate-200 flex items-center justify-center text-slate-500 text-2xl">
                        <BiUser />
                      </div>
                    )}

                    <div>
                      <p className="text-xs font-semibold text-slate-700">Profile Photo</p>
                      <p className="text-[10px] text-slate-500">
                        {formData.photoURL ? 'Synced from Google Auth' : 'Upload an official profile image (Max 1 MB)'}
                      </p>
                      <button
                        type="button"
                        onClick={() => openMediaLibrary('avatar')}
                        className="inline-block mt-2 text-xs font-semibold text-blue-600 hover:underline"
                      >
                        Change Photo
                      </button>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-[11px] font-bold text-slate-600 uppercase tracking-wider mb-1">
                        Full Name <span className="text-red-500">*</span>
                      </label>
                      <input
                        id="fullName"
                        type="text"
                        value={formData.fullName}
                        onChange={handleInputChange}
                        placeholder="Jane Doe, Esq."
                        className="w-full border border-slate-300 rounded-lg p-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-bold text-slate-600 uppercase tracking-wider mb-1">Work Email</label>
                      <input
                        type="email"
                        value={formData.email}
                        readOnly
                        className="w-full border border-slate-200 rounded-lg p-2.5 text-sm bg-slate-100 text-slate-500 cursor-not-allowed"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-bold text-slate-600 uppercase tracking-wider mb-1">
                        Phone Number <span className="text-red-500">*</span>
                      </label>
                      <input
                        id="phone"
                        type="tel"
                        value={formData.phone}
                        onChange={handleInputChange}
                        placeholder="+44 7123 456789"
                        className="w-full border border-slate-300 rounded-lg p-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-bold text-slate-600 uppercase tracking-wider mb-1">Office / Firm Address</label>
                      <input
                        id="address"
                        type="text"
                        value={formData.address}
                        onChange={handleInputChange}
                        placeholder="123 Legal Chambers St, London"
                        className="w-full border border-slate-300 rounded-lg p-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                  </div>
                </div>
              )}

              {/* STEP 2: Credentials */}
              {currentStep === 2 && (
                <div className="space-y-4">
                  <div className="border-b pb-3">
                    <h2 className="text-xl font-bold text-[#080B1A]">Professional Credentials</h2>
                    <p className="text-xs text-slate-500 mt-0.5">Provide your active registration number and practice role.</p>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-[11px] font-bold text-slate-600 uppercase tracking-wider mb-1">
                        Role / Title <span className="text-red-500">*</span>
                      </label>
                      <select
                        id="jobTitle"
                        value={formData.jobTitle}
                        onChange={handleInputChange}
                        className="w-full border border-slate-300 rounded-lg p-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                      >
                        <option value="">Select practice role</option>
                        <option value="Senior Partner">Senior Partner</option>
                        <option value="Associate Solicitor">Associate Solicitor</option>
                        <option value="Paralegal">Paralegal</option>
                        <option value="Barrister">Barrister</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-[11px] font-bold text-slate-600 uppercase tracking-wider mb-1">
                        SRA Registration Number <span className="text-red-500">*</span>
                      </label>
                      <input
                        id="registrationNumber"
                        type="text"
                        value={formData.registrationNumber}
                        onChange={handleInputChange}
                        placeholder="e.g. SRA-109283"
                        className="w-full border border-slate-300 rounded-lg p-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                  </div>
                </div>
              )}

              {/* STEP 3: Verification Documents */}
              {currentStep === 3 && (
                <div className="space-y-6">
                  <div className="border-b pb-3">
                    <h2 className="text-xl font-bold text-[#080B1A]">Verification Documents</h2>
                    <p className="text-xs text-slate-500 mt-0.5">Upload valid proof of identity and professional qualification (Max 3 MB per document).</p>
                  </div>

                  <div>
                    <label className="block text-[11px] font-bold text-slate-600 uppercase tracking-wider mb-2">
                      Government Issued ID (Passport / Driving License) <span className="text-red-500">*</span>
                    </label>
                    <button
                      type="button"
                      onClick={() => openMediaLibrary('idCard')}
                      className="flex flex-col items-center border-2 border-dashed border-slate-300 hover:border-blue-500 p-6 rounded-xl cursor-pointer bg-slate-50 transition-colors w-full"
                    >
                      <BiCloudUpload className="text-3xl text-slate-400 mb-1" />
                      <span className="text-xs font-semibold text-slate-700">
                        {fileNames.idCard ? fileNames.idCard : 'Click to select ID Document'}
                      </span>
                      <span className="text-[10px] text-slate-400 mt-1">PNG, JPG, or PDF up to 3 MB</span>
                    </button>
                  </div>

                  <div>
                    <label className="block text-[11px] font-bold text-slate-600 uppercase tracking-wider mb-2">
                      Legal Practice License / SRA Certificate <span className="text-red-500">*</span>
                    </label>
                    <button
                      type="button"
                      onClick={() => openMediaLibrary('licenseDoc')}
                      className="flex flex-col items-center border-2 border-dashed border-slate-300 hover:border-blue-500 p-6 rounded-xl cursor-pointer bg-slate-50 transition-colors w-full"
                    >
                      <BiCloudUpload className="text-3xl text-slate-400 mb-1" />
                      <span className="text-xs font-semibold text-slate-700">
                        {fileNames.licenseDoc ? fileNames.licenseDoc : 'Click to select Practice Certificate'}
                      </span>
                      <span className="text-[10px] text-slate-400 mt-1">PNG, JPG, or PDF up to 3 MB</span>
                    </button>
                  </div>
                </div>
              )}

              {/* Stepper Footer Controls */}
              <div className="flex flex-col-reverse gap-3 mt-8 pt-4 border-t border-slate-200 sm:flex-row sm:items-center sm:justify-between">
                <button
                  type="button"
                  onClick={handleBack}
                  disabled={currentStep === 1}
                  className="px-4 py-2 border border-slate-300 text-slate-700 hover:bg-slate-50 text-xs font-semibold rounded-xl disabled:opacity-40 transition-colors"
                >
                  Back
                </button>

                {currentStep < 3 ? (
                  <button
                    type="button"
                    onClick={handleNext}
                    className="px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold rounded-xl flex items-center justify-center gap-1.5 shadow-sm transition-colors"
                  >
                    Continue to {currentStep === 1 ? 'Credentials' : 'Documents'} <IoArrowForward />
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={handleSubmit}
                    disabled={submitting}
                    className="px-6 py-2 bg-[#080B1A] hover:bg-slate-800 text-white text-xs font-semibold rounded-xl disabled:opacity-50 transition-colors shadow-md"
                  >
                    {submitting ? 'Submitting Application...' : 'Submit Application'}
                  </button>
                )}
              </div>

            </div>
          </div>
        )}

      <MediaLibrary
        open={mediaPicker !== null}
        onClose={() => setMediaPicker(null)}
        onSelect={handleMediaSelect}
        accept={mediaPicker === 'avatar' ? 'image/*' : 'image/*,application/pdf'}
        title={
          mediaPicker === 'avatar'
            ? 'Select Profile Photo'
            : mediaPicker === 'idCard'
            ? 'Select Government ID'
            : 'Select Practice License'
        }
      />
      </main>
    </div>
  );
};

export default Applicant;