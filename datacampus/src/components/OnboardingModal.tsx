"use client";

import React, { useState, useEffect } from "react";
import { GraduationCap, BookOpen, Check, X, ArrowRight, ArrowLeft } from "lucide-react";
import { supabase } from "@/utils/supabaseClient";
import { usePreferences } from "@/hooks/usePreferences";
import ModalPortal from "./ModalPortal";

const schools = [
  {
    name: "School of Engineering & Technology",
    icon: GraduationCap,
    programs: ["Electrical & Electronics", "Telecommunications", "Instrumentation"],
  },
  {
    name: "School of Business",
    icon: BookOpen,
    programs: ["Accountancy", "BBA", "Marketing", "Purchasing & Supply"],
  },
  {
    name: "School of Information & Communication Technology",
    icon: BookOpen,
    programs: ["BSE", "Cyber Security", "BIT", "BICTE"],
  },
];

interface OnboardingModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function OnboardingModal({ isOpen, onClose }: OnboardingModalProps) {
  const { setPreferences } = usePreferences();
  const [step, setStep] = useState(1);
  const [selectedSchool, setSelectedSchool] = useState<string>("");
  const [selectedPrograms, setSelectedPrograms] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    const checkOnboarding = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (user?.user_metadata?.onboarding_completed || localStorage.getItem("dc:preferences")) {
        onClose();
      }
    };
    checkOnboarding();
  }, [isOpen, onClose]);

  const handleSchoolSelect = (schoolName: string) => {
    setSelectedSchool(schoolName);
    setSelectedPrograms([]);
  };

  const handleProgramToggle = (program: string) => {
    setSelectedPrograms((prev) =>
      prev.includes(program) ? prev.filter((p) => p !== program) : [...prev, program]
    );
  };

  const handleNext = () => {
    if (step < 3) setStep(step + 1);
  };

  const handleBack = () => {
    if (step > 1) setStep(step - 1);
  };

  const handleSkip = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      await supabase.auth.updateUser({
        data: { onboarding_completed: true },
      });
    }
    try {
      localStorage.setItem("dc:onboarding_done", "true");
    } catch {
      // ignore
    }
    onClose();
  };

  const handleComplete = async () => {
    setLoading(true);
    const prefs = { school: selectedSchool, program: selectedPrograms[0] || "" };
    const { data: { user } } = await supabase.auth.getUser();
    await setPreferences(prefs, Boolean(user));
    if (user) {
      await supabase.auth.updateUser({
        data: {
          onboarding_completed: true,
          preferred_school: selectedSchool,
          preferred_programs: selectedPrograms,
          preferences: prefs,
        },
      });
    }
    try {
      localStorage.setItem("dc:onboarding_done", "true");
    } catch {
      // ignore
    }
    setLoading(false);
    onClose();
  };

  if (!isOpen) return null;

  return (
    <ModalPortal>
      <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
        <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl w-full max-w-md max-h-[90vh] overflow-hidden flex flex-col">
          <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-800">
            <div className="flex items-center gap-2">
              <GraduationCap className="text-indigo-600 dark:text-indigo-400" size={24} />
              <h2 className="text-lg font-bold">Welcome to DataCampus</h2>
            </div>
            <button
              onClick={handleSkip}
              className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 transition-colors"
              aria-label="Skip onboarding"
            >
              <X size={20} />
            </button>
          </div>

          <div className="flex items-center gap-2 px-4 py-3 bg-gray-50 dark:bg-gray-800">
            {[1, 2, 3].map((s) => (
              <div
                key={s}
                className={`h-1 flex-1 rounded-full transition-colors ${
                  s <= step ? "bg-indigo-600 dark:bg-indigo-400" : "bg-gray-300 dark:bg-gray-600"
                }`}
              />
            ))}
          </div>

          <div className="flex-1 overflow-y-auto p-4">
            {step === 1 && (
              <div className="space-y-4">
                <div>
                  <h3 className="text-xl font-semibold mb-2">Select Your School</h3>
                  <p className="text-sm text-gray-600 dark:text-gray-400">
                    Choose your school to see relevant resources
                  </p>
                </div>
                <div className="space-y-2">
                  {schools.map((school) => {
                    const Icon = school.icon;
                    return (
                      <button
                        key={school.name}
                        onClick={() => handleSchoolSelect(school.name)}
                        className={`w-full flex items-center gap-3 p-4 rounded-xl border-2 transition-all ${
                          selectedSchool === school.name
                            ? "border-indigo-600 dark:border-indigo-400 bg-indigo-50 dark:bg-indigo-900/20"
                            : "border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600"
                        }`}
                      >
                        <div
                          className={`p-2 rounded-lg ${
                            selectedSchool === school.name
                              ? "bg-indigo-600 dark:bg-indigo-400 text-white"
                              : "bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400"
                          }`}
                        >
                          <Icon size={20} />
                        </div>
                        <span className="font-medium text-left">{school.name}</span>
                        {selectedSchool === school.name && (
                          <Check className="ml-auto text-indigo-600 dark:text-indigo-400" size={20} />
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {step === 2 && selectedSchool && (
              <div className="space-y-4">
                <div>
                  <h3 className="text-xl font-semibold mb-2">Select Your Programs</h3>
                  <p className="text-sm text-gray-600 dark:text-gray-400">
                    Choose the programs you&apos;re interested in
                  </p>
                </div>
                <div className="space-y-2">
                  {schools
                    .find((s) => s.name === selectedSchool)
                    ?.programs.map((program) => (
                      <button
                        key={program}
                        onClick={() => handleProgramToggle(program)}
                        className={`w-full flex items-center gap-3 p-4 rounded-xl border-2 transition-all ${
                          selectedPrograms.includes(program)
                            ? "border-indigo-600 dark:border-indigo-400 bg-indigo-50 dark:bg-indigo-900/20"
                            : "border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600"
                        }`}
                      >
                        <div
                          className={`w-6 h-6 rounded-full border-2 flex items-center justify-center transition-colors ${
                            selectedPrograms.includes(program)
                              ? "border-indigo-600 dark:border-indigo-400 bg-indigo-600 dark:bg-indigo-400"
                              : "border-gray-300 dark:border-gray-600"
                          }`}
                        >
                          {selectedPrograms.includes(program) && (
                            <Check size={14} className="text-white" />
                          )}
                        </div>
                        <span className="font-medium">{program}</span>
                      </button>
                    ))}
                </div>
              </div>
            )}

            {step === 3 && (
              <div className="space-y-4">
                <div>
                  <h3 className="text-xl font-semibold mb-2">You&apos;re All Set!</h3>
                  <p className="text-sm text-gray-600 dark:text-gray-400">
                    Review your preferences and start exploring
                  </p>
                </div>
                <div className="bg-gray-50 dark:bg-gray-800 rounded-xl p-4 space-y-3">
                  <div>
                    <span className="text-xs text-gray-500 dark:text-gray-400 uppercase font-semibold">
                      School
                    </span>
                    <p className="font-medium">{selectedSchool}</p>
                  </div>
                  <div>
                    <span className="text-xs text-gray-500 dark:text-gray-400 uppercase font-semibold">
                      Programs
                    </span>
                    <div className="flex flex-wrap gap-2 mt-1">
                      {selectedPrograms.map((program) => (
                        <span
                          key={program}
                          className="px-3 py-1 bg-indigo-100 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300 rounded-full text-sm"
                        >
                          {program}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>

          <div className="flex items-center gap-3 p-4 border-t border-gray-200 dark:border-gray-800">
            {step > 1 && (
              <button
                onClick={handleBack}
                className="flex items-center gap-2 px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
              >
                <ArrowLeft size={18} />
                <span>Back</span>
              </button>
            )}
            <button
              onClick={step === 3 ? handleComplete : handleNext}
              disabled={(step === 1 && !selectedSchool) || (step === 2 && selectedPrograms.length === 0) || loading}
              className="flex-1 flex items-center justify-center gap-2 px-4 py-2 rounded-lg bg-indigo-600 dark:bg-indigo-500 text-white hover:bg-indigo-700 dark:hover:bg-indigo-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {loading ? (
                <span>Saving...</span>
              ) : step === 3 ? (
                "Start Exploring"
              ) : (
                <>
                  <span>Next</span>
                  <ArrowRight size={18} />
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </ModalPortal>
  );
}
