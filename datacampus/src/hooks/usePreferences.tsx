"use client";
import React, { createContext, useContext, useEffect, useState } from "react";
import { supabase } from "@/utils/supabaseClient";

type Pref = { school?: string; program?: string } | null;

type ContextValue = {
    preferences: Pref;
    setPreferences: (p: Pref, saveToAccount?: boolean) => Promise<{ error?: any } | void>;
    saveToDevice: (p: Pref) => void;
    saveToAccount: (p: Pref) => Promise<{ error?: any } | void>;
    loading: boolean;
};

const defaultVal: ContextValue = {
    preferences: null,
    setPreferences: async () => {},
    saveToDevice: () => {},
    saveToAccount: async () => {},
    loading: false,
};

const PreferencesContext = createContext<ContextValue>(defaultVal);

export const PreferencesProvider = ({ children }: { children: React.ReactNode }) => {
    const [preferences, setPreferencesState] = useState<Pref>(null);
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        // Load from localStorage first
        try {
            const raw = localStorage.getItem("dc:preferences");
            if (raw) {
                setPreferencesState(JSON.parse(raw));
            }
        } catch (e) {
            // ignore
        }

        // Load from auth metadata when available
        let mounted = true;
        (async () => {
            const { data } = await supabase.auth.getSession();
            if (!mounted) return;
            const session = data.session ?? null;
            if (session?.user?.user_metadata?.preferences) {
                try {
                    const p = session.user.user_metadata.preferences;
                    setPreferencesState((prev) => ({ ...(prev || {}), ...(p || {}) }));
                } catch (e) {
                    // ignore
                }
            }
        })();

        const { data: sub } = supabase.auth.onAuthStateChange((_ev, s) => {
            const session = s ?? null;
            if (session?.user?.user_metadata?.preferences) {
                setPreferencesState(session.user.user_metadata.preferences);
            }
        });

        return () => {
            mounted = false;
            sub?.subscription.unsubscribe();
        };
    }, []);

    const saveToDevice = (p: Pref) => {
        if (!p) return;
        try {
            localStorage.setItem("dc:preferences", JSON.stringify(p));
            setPreferencesState(p);
        } catch (e) {
            // ignore
        }
    };

    const saveToAccount = async (p: Pref) => {
        if (!p) return { error: 'no preferences' };
        setLoading(true);
        try {
            const { error } = await supabase.auth.updateUser({ data: { preferences: p } } as any);
            if (error) return { error };
            setPreferencesState(p);
            return { error: null };
        } catch (err) {
            return { error: err };
        } finally {
            setLoading(false);
        }
    };

    const setPreferences = async (p: Pref, saveToAccountFlag = false) => {
        saveToDevice(p);
        if (saveToAccountFlag) {
            return await saveToAccount(p);
        }
        return { error: null };
    };

    return (
        <PreferencesContext.Provider value={{ preferences, setPreferences, saveToDevice, saveToAccount, loading }}>
            {children}
        </PreferencesContext.Provider>
    );
};

export const usePreferences = () => useContext(PreferencesContext);

export default usePreferences;
