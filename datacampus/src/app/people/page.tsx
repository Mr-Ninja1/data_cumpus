"use client";

import React, { Suspense } from "react";
import PeopleHub from "@/components/PeopleHub";
import LoadingSkeleton from "@/components/LoadingSkeleton";

export default function PeoplePage() {
  return (
    <Suspense fallback={<LoadingSkeleton />}>
      <PeopleHub />
    </Suspense>
  );
}
