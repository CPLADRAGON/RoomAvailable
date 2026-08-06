import type { ClusterInfo } from "@/types";

export const CLUSTERS: ClusterInfo[] = [
  { id: "Computing", label: "COM Computing", lat: 1.2944, lng: 103.7746 },
  { id: "Engineering", label: "ENG Engineering", lat: 1.3018, lng: 103.7717 },
  { id: "FASS", label: "FASS", lat: 1.2951, lng: 103.7768 },
  { id: "UTown", label: "UTown", lat: 1.304, lng: 103.774 },
  { id: "Business", label: "BIZ Business", lat: 1.2938, lng: 103.7752 },
  { id: "Design & Environment", label: "SDE Design & Env", lat: 1.2965, lng: 103.77 },
  { id: "Science", label: "SCI Science", lat: 1.2966, lng: 103.7809 },
  { id: "Medicine", label: "Medicine", lat: 1.2887, lng: 103.7829 },
  { id: "Law", label: "Law", lat: 1.294, lng: 103.779 },
  { id: "Music", label: "Music", lat: 1.2953, lng: 103.78 },
  { id: "Lecture Theatre", label: "Lecture Theatres", lat: 1.297, lng: 103.773 },
  { id: "Other", label: "Other", lat: 1.296, lng: 103.776 },
];

export const DEFAULT_LOCATION = { lat: 1.2966, lng: 103.7764 };
