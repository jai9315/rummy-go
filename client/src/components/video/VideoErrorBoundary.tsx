"use client";

import React from "react";
import { VideoFallbackGrid } from "@/components/video/VideoOverlay";

interface VideoErrorBoundaryProps {
  children: React.ReactNode;
}

interface VideoErrorBoundaryState {
  hasError: boolean;
}

/**
 * Lightweight React Error Boundary around VideoOverlay so any unexpected
 * WebRTC/LiveKit SDK exception falls back to the hook-free avatar grid
 * instead of crashing the game table.
 */
export class VideoErrorBoundary extends React.Component<
  VideoErrorBoundaryProps,
  VideoErrorBoundaryState
> {
  constructor(props: VideoErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(): VideoErrorBoundaryState {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo): void {
    console.warn("VideoOverlay caught runtime error, falling back to avatar grid:", error, info);
  }

  render(): React.ReactNode {
    if (this.state.hasError) {
      return <VideoFallbackGrid statusLabel="Video Unavailable" />;
    }
    return this.props.children;
  }
}
