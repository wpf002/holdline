/** Sends sign-in links. The link is the only secret; it works once, for a short time. */
export interface Mailer {
  sendLoginLink(to: string, url: string): Promise<void>;
}

/** Resend's HTTP API (https://resend.com/docs/api-reference/emails/send-email). */
export function resendMailer(apiKey: string, from: string): Mailer {
  return {
    async sendLoginLink(to, url) {
      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { authorization: `Bearer ${apiKey}`, "content-type": "application/json" },
        body: JSON.stringify({
          from,
          to,
          subject: "Your Holdline sign-in link",
          text: `Sign in to Holdline:\n\n${url}\n\nThe link works once, for 15 minutes. If you didn't ask for it, ignore this email.`,
        }),
      });
      if (!res.ok) throw new Error(`Resend answered ${res.status}`);
    },
  };
}

/** Local development only: prints the link to the API console instead of emailing it. */
export function logMailer(print: (line: string) => void): Mailer {
  return {
    async sendLoginLink(to, url) {
      print(`Sign-in link for ${to} (set RESEND_API_KEY to email it): ${url}`);
    },
  };
}
