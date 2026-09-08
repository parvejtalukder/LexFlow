"use client";

import {
  createUserWithEmailAndPassword,
  GoogleAuthProvider,
  onAuthStateChanged,
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
          const params = new URLSearchParams({ uid: currentUser.uid });
          if (currentUser.email) params.set('email', currentUser.email);

          const res = await axios.get(`/api/users/role?${params.toString()}`);
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