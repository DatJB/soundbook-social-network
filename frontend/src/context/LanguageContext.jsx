import React, { createContext, useContext, useEffect, useState } from 'react';
import { en } from '../locales/en';
import { vi } from '../locales/vi';

const translations = { en, vi };
const LanguageContext = createContext();

export const useLanguage = () => {
  const context = useContext(LanguageContext);
  if (!context) {
    throw new Error('useLanguage must be used within a LanguageProvider');
  }
  return context;
};

export const LanguageProvider = ({ children }) => {
  const [language, setLanguage] = useState('vi');

  useEffect(() => {
    localStorage.setItem('language', 'vi');
  }, []);

  const toggleLanguage = () => {
    // Keep locked to 'vi'
    setLanguage('vi');
  };

  const t = (key) => {
    return translations[language][key] || key;
  };

  return (
    <LanguageContext.Provider value={{ language, toggleLanguage, setLanguage, t }}>
      {children}
    </LanguageContext.Provider>
  );
};
