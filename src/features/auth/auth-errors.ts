/** Only reviewed error codes leave the auth boundary. Never echo provider text. */
export function authErrorMessage(error: unknown, verifying: boolean): string {
  const code = typeof error === "object" && error !== null && "code" in error ? error.code : undefined;
  if (code === "email_address_not_authorized") return "This development email service cannot send to this address. Use an approved project-team test address or ask the developer to configure SMTP.";
  if (code === "over_email_send_rate_limit" || code === "over_request_rate_limit") return "The sign-in email rate limit has been reached. Please wait before requesting another code.";
  if (code === "email_provider_disabled" || code === "otp_disabled" || code === "signup_disabled") return "Email-code sign-in is disabled for this development project. Check the project's authentication settings.";
  if (code === "captcha_failed") return "This project requires a CAPTCHA that this sign-in form does not yet support. Check the development project's bot-protection settings.";
  if (code === "otp_expired") return "This code has expired or is invalid. Request a new code and try again.";
  return verifying ? "This code could not be verified. Check it or request a new code." : "A sign-in code could not be sent. Please try again later.";
}
