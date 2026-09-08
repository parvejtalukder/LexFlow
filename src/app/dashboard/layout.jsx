import React from 'react';
import PrivateRoute from '@/security/PrivateRoute';

export const metadata = {
  title: "Dashboard | LexFlow",
  description: "Law Firm Case & Financial Management",
};

const layout = ({ children }) => {

    return (
        <PrivateRoute>
        { children }
        </PrivateRoute>
    );
};

export default layout;