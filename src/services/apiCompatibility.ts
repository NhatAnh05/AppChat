/** Excel rows 11/12 use the same history event; row 15 has a CHAT_ request prefix.
 * Keep the existing deployment profile by default; opt into literal Excel requests. */
export function preferExcelApi(): boolean {
  return import.meta.env?.VITE_CHAT_API_PROFILE === 'excel';
}
