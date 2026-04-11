/* ************************************************************************** */
/*                                                                            */
/*    middleware.ts                                     :::      ::::::::    */
/*                                                      :+:      :+:    :+:  */
/*    By: Claude (LTS)                                  #+#  +:+       +#+    */
/*                                                    +#+#+#+#+#+   +#+       */
/*    Created: 2026/03/26 10:44 by Claude (LTS)       #+#    #+#         */
/*    Updated: 2026/03/26 10:44 by Claude (LTS)       ###   ########      */
/*                                                                            */
/*    © Life Time Support Inc.                                           */
/*                                                                            */
/* ************************************************************************** */
import { withAuth } from 'next-auth/middleware'

export default withAuth({
  pages: {
    signIn: '/auth/signin',
  },
})

export const config = {
  matcher: [
    /*
     * Match all request paths except:
     * - auth (sign in pages)
     * - api/auth (NextAuth routes)
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - public files
     */
    '/((?!auth|api/auth|api/subscriptions/cron|api/backup|api/payments/import-json|sign|api/contracts/[^/]+/signing-data|api/contracts/[^/]+/sign|_next/static|_next/image|favicon.ico|pdf\\.worker\\.min\\.mjs|fonts/.*|.*\\.png$|.*\\.jpg$|.*\\.svg$).*)',
  ],
}
