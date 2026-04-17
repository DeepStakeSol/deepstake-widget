// middleware.ts
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export function middleware(request: NextRequest) {
  const frontendURL = process.env.APP_URL?.toLowerCase() || "http://localhost:8080";
  
  // Check if the request is for an API route
  if (request.nextUrl.pathname.startsWith('/api')) {
    if (request.method === "OPTIONS") {
      console.log("OPTIONS request happen");
      const res = new NextResponse(null, { status: 204 });
      res.headers.set("Access-Control-Allow-Origin", frontendURL);
      res.headers.set("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
      res.headers.set("Access-Control-Allow-Headers", "Content-Type, Authorization");
      res.headers.set("Access-Control-Max-Age", "86400");
      return res
    }
    
    const response = NextResponse.next();
    // Set custom headers
    //response.headers.set('X-Custom-Header', 'MyCustomValue');
    response.headers.set('Access-Control-Allow-Origin', frontendURL);
    response.headers.set("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
    
    return response;
  }

  // Pass through non-API requests
  return NextResponse.next();
}

// Optionally, specify which paths the middleware applies to
export const config = {
  matcher: ['/api/:path*'], // Apply to all API routes
};