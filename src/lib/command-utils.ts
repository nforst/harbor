/**
 * Wrapper function to handle errors in command actions.
 * Logs error message to console.
 */
export function handleCommandError(error: any): string {
    return error?.message ?? String(error);
}
