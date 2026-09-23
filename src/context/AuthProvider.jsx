"use client";

import {
  createUserWithEmailAndPassword,
  GoogleAuthProvider,
  onAuthStateChanged,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut,
  updateProfile,
} from "firebase/auth";
import { useEffect, useState } from "react";
import axios from "axios"; 

import { AuthContext } from "./AuthContext";
import { auth } from "@/firebase/firebase.config";

const googleProvider = new GoogleAuthProvider();

const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [role, setRole] = useState(null); 
  const [loading, setLoading] = useState(true);
  const [roleLoading, setRoleLoading] = useState(true);
  const [accountStatus, setAccountStatus] = useState(null);
  const [roleStatus, setRoleStatus] = useState(null); // legacy alias of accountStatus
  const [deactivated, setDeactivated] = useState(false);

  const registerUser = (email, password) => {
    return createUserWithEmailAndPassword(auth, email, password);
  };

  const signInUser = (email, password) => {
    return signInWithEmailAndPassword(auth, email, password);
  };

  const goWithGoogle = () => {
    return signInWithPopup(auth, googleProvider);
  };

  /**
   * Send a password-reset email.
   *
   * The continue URL is derived from wherever the app is running, so the emailed
   * link comes back to this deployment without any per-environment config.
   * Firebase sends the mail itself, and the link it contains is single-use.
   */
  const sendReset = (email) => {
    const clean = String(email || '').trim();
    const actionCodeSettings =
      typeof window === 'undefined'
        ? undefined
        : { url: `${window.location.origin}/`, handleCodeInApp: false };

    return sendPasswordResetEmail(auth, clean, actionCodeSettings);
  };

  const logOut = async () => {
    setLoading(true);
    try {
      await signOut(auth);
      setUser(null);
      setRole(null);
      setAccountStatus(null);
      setRoleStatus(null);
      setDeactivated(false);
    } catch (error) {
      console.error("Logout error:", error);
      throw error;
    } finally {
      setLoading(false);
      setRoleLoading(false);
    }
  };

  const updateUser = (profile) => {
    if (!auth.currentUser) {
      throw new Error("No authenticated user.");
    }
    return updateProfile(auth.currentUser, profile);
  };

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      setUser(currentUser);

      if (currentUser?.uid) {
        setRoleLoading(true);
        try {
          // The route reads identity from this ID token, not from the query
          // string, so the header is required. useAxiosSecure cannot be used
          // here: this provider *is* the auth source, so the hook would be
          // circular.
          const token = await currentUser.getIdToken();
          const res = await axios.get('/api/users/role', {
            headers: { Authorization: `Bearer ${token}` },
          });
          if (res.data?.success) {
            // Deactivated accounts are blocked from logging in entirely.
            if (res.data.accountStatus === 'DEACTIVATED') {
              setDeactivated(true);
              setRole(null);
              setAccountStatus('DEACTIVATED');
              setRoleStatus('DEACTIVATED');
              await signOut(auth);
            } else {
              setRole(res.data.role);
              // Store accountStatus so route guards can enforce the access lifecycle.
              setAccountStatus(res.data.accountStatus || res.data.status || null);
              setRoleStatus(res.data.accountStatus || res.data.status || null);
            }
          }
        } catch (error) {
          console.error("Failed to fetch user role:", error);
          setRole(null);
          setAccountStatus(null);
          setRoleStatus(null);
        } finally {
          setRoleLoading(false);
        }
      } else {
        setRole(null);
        setAccountStatus(null);
        setRoleStatus(null);
        setRoleLoading(false);
      }

      setLoading(false); 
    });

    return () => unsubscribe();
  }, []);

  const authInfo = {
    user,
    role,
    accountStatus,
    roleStatus,
    loading: loading || roleLoading,
    roleLoading,
    deactivated,
    registerUser,
    signInUser,
    goWithGoogle,
    sendReset,
    logOut,
    updateUser,
  };

  return (
    <AuthContext.Provider value={authInfo}>
      {children}
    </AuthContext.Provider>
  );
};

export default AuthProvider;