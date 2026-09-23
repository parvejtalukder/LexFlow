'use client';

import axios from 'axios';
import { useMemo } from 'react';
import useAuth from './useAuth';
import { auth } from '@/firebase/firebase.config';

const server_domain = process.env.NEXT_PUBLIC_SERVER_URL;

const useAxiosSecure = () => {

    const { user, logOut } = useAuth();

    const axiosSecure = useMemo(() => {
        const instance = axios.create({
            baseURL: server_domain,
            headers: {
                'Content-Type': 'application/json',
            },
        });

        instance.interceptors.request.use(
            async (config) => {
                // `user` comes from React state and lags for a moment after a
                // fresh sign-up or sign-in, which used to send the very first
                // request with no token at all. The SDK's current user is already
                // set at that point, so it is the reliable source.
                const current = user || auth.currentUser;
                if (current) {
                    const token = await current.getIdToken();
                    config.headers.Authorization = `Bearer ${token}`;
                }
                return config;
            },
            (error) => Promise.reject(error)
        );

        instance.interceptors.response.use(
            (response) => response,
            async (error) => {
                const status = error.response ? error.response.status : null;
                // Only an invalid/expired token should end the session. A 403
                // means "you are signed in but not allowed to do this" (e.g. a
                // document you cannot view), so signing the user out there would
                // silently drop a valid admin session.
                if (status === 401 && logOut) {
                    await logOut();
                }
                return Promise.reject(error);
            }
        );

        return instance;
    }, [user, logOut]);

    return axiosSecure;
};

export default useAxiosSecure;