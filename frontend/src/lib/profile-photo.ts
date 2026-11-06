"use client";

import { useEffect, useState } from "react";
import { apiBlob } from "@/lib/api";

export function useProfilePhoto(updatedAt: string | null | undefined) {
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!updatedAt) {
      setUrl(null);
      return;
    }
    let active = true;
    let objectUrl: string | null = null;
    apiBlob("/profile/photo")
      .then((blob) => {
        objectUrl = URL.createObjectURL(blob);
        if (active) setUrl(objectUrl);
        else URL.revokeObjectURL(objectUrl);
      })
      .catch(() => {
        if (active) setUrl(null);
      });
    return () => {
      active = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [updatedAt]);

  return url;
}
