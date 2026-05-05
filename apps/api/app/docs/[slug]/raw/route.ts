import { isDocSlug } from "@/lib/docs";
import { readDoc } from "@/lib/docs-content";

interface RouteContext {
  params: Promise<{ slug: string }>;
}

export const GET = async (_request: Request, { params }: RouteContext) => {
  const { slug } = await params;
  if (!isDocSlug(slug)) {
    return new Response("Not found", { status: 404 });
  }
  return new Response(readDoc(slug), {
    headers: {
      "Content-Type": "text/markdown; charset=utf-8",
      "Cache-Control": "public, max-age=300",
    },
  });
};
