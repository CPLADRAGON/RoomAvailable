"use client";

import { useState } from "react";
import { useModalA11y } from "@/hooks/useModalA11y";

const ENDPOINT = process.env.NEXT_PUBLIC_FEEDBACK_ENDPOINT;
const FALLBACK_EMAIL = process.env.NEXT_PUBLIC_FEEDBACK_EMAIL;

type Status = "idle" | "submitting" | "success" | "error";

export default function FeedbackModal({ onClose }: { onClose: () => void }) {
  const [message, setMessage] = useState("");
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<Status>("idle");
  const [errorMsg, setErrorMsg] = useState("");

  const canSubmit = message.trim().length > 0 && status !== "submitting";
  const dialogRef = useModalA11y<HTMLDivElement>(onClose);

  const submit = async () => {
    if (!canSubmit) return;

    // No backend configured: fall back to the user's mail client when possible.
    if (!ENDPOINT) {
      if (FALLBACK_EMAIL) {
        const subject = encodeURIComponent("NUS Vacansee feedback");
        const body = encodeURIComponent(message + (email ? `\n\nFrom: ${email}` : ""));
        window.location.href = `mailto:${FALLBACK_EMAIL}?subject=${subject}&body=${body}`;
        setStatus("success");
        return;
      }
      setStatus("error");
      setErrorMsg("Feedback isn’t configured yet. Please try again later.");
      return;
    }

    setStatus("submitting");
    setErrorMsg("");
    try {
      const res = await fetch(ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ message: message.trim(), email: email.trim() || undefined }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setStatus("success");
    } catch {
      setStatus("error");
      setErrorMsg(
        "Couldn't send your feedback right now. Please try again in a moment" +
          (FALLBACK_EMAIL ? ", or email us instead." : ".")
      );
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/30 backdrop-blur-sm sm:items-center"
      onClick={onClose}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label="Send feedback"
        tabIndex={-1}
        className="glass w-full max-w-md rounded-t-2xl p-5 outline-none sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-start justify-between">
          <div>
            <h2 className="text-base font-bold text-nus-blue">Send feedback</h2>
            <p className="text-xs text-zinc-500">
              Spotted a wrong room status or have an idea? Tell us.
            </p>
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            className="rounded-full p-1 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-600"
          >
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
              <path d="M5 5l10 10M15 5L5 15" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
          </button>
        </div>

        {status === "success" ? (
          <div className="py-6 text-center">
            <div className="mx-auto mb-2 flex h-10 w-10 items-center justify-center rounded-full bg-emerald-100 text-emerald-600">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
                <path d="M5 13l4 4L19 7" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </div>
            <p className="text-sm font-medium text-zinc-700">Thanks for the feedback!</p>
            <button
              onClick={onClose}
              className="mt-4 rounded-lg bg-nus-blue px-4 py-2 text-sm font-medium text-white"
            >
              Done
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              rows={4}
              placeholder="What's working, what's not, or what you'd love to see…"
              className="w-full resize-none rounded-lg border border-zinc-200 bg-white/70 px-3 py-2 text-sm text-zinc-800 placeholder-zinc-400 outline-none focus:border-nus-orange focus:ring-2 focus:ring-nus-orange/20"
            />
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Email (optional, if you'd like a reply)"
              className="w-full rounded-lg border border-zinc-200 bg-white/70 px-3 py-2 text-sm text-zinc-800 placeholder-zinc-400 outline-none focus:border-nus-orange focus:ring-2 focus:ring-nus-orange/20"
            />
            {status === "error" && (
              <p className="text-xs text-red-600">
                {errorMsg}
                {FALLBACK_EMAIL && (
                  <>
                    {" "}
                    <a
                      href={`mailto:${FALLBACK_EMAIL}?subject=${encodeURIComponent(
                        "NUS Vacansee feedback"
                      )}&body=${encodeURIComponent(message)}`}
                      className="underline"
                    >
                      Email us
                    </a>
                  </>
                )}
              </p>
            )}
            <button
              onClick={submit}
              disabled={!canSubmit}
              className="w-full rounded-lg bg-nus-blue px-4 py-2.5 text-sm font-medium text-white transition-opacity hover:bg-nus-blue/90 disabled:opacity-50"
            >
              {status === "submitting" ? "Sending…" : "Send feedback"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
