import {
  ArrowRightIcon,
  ShieldAlertIcon,
  ShieldCheckIcon,
  TimerIcon,
} from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { validateAuthorizationUrl } from "@/server/mcp/validate-authorization-url";

export const AuthorizationStartView = ({
  serverName,
  authorizationUrl,
}: {
  serverName: string;
  authorizationUrl: string;
}) => {
  if (!validateAuthorizationUrl(authorizationUrl).valid) {
    return (
      <PageShell>
        <Alert variant="destructive">
          <ShieldAlertIcon />
          <AlertTitle>Authorization URL rejected</AlertTitle>
          <AlertDescription>
            <strong>{serverName}</strong> tried to redirect to a URL that
            isn&rsquo;t a valid HTTPS endpoint. Pookie blocked it. Return to
            Slack and try a different MCP server.
          </AlertDescription>
        </Alert>
      </PageShell>
    );
  }

  return (
    <PageShell>
      <Card>
        <CardHeader>
          <ShieldCheckIcon />
          <CardTitle>MCP Authorization</CardTitle>
          <CardDescription>
            Continue connecting <strong>{serverName}</strong> to Pookie.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <p className="text-muted-foreground text-sm">
            If Slack opened this in an in-app browser and the provider reports{" "}
            <em>&ldquo;Client not approved&rdquo;</em>, copy the authorization
            URL below into your regular browser and try again.
          </p>
          <Button
            size="lg"
            nativeButton={false}
            render={
              <a
                aria-label={`Continue authorization for ${serverName}`}
                href={authorizationUrl}
              />
            }
          >
            Continue to authorization
            <ArrowRightIcon data-icon="inline-end" />
          </Button>
          <pre className="bg-muted text-muted-foreground overflow-x-auto rounded-md p-3 font-mono text-xs break-all whitespace-pre-wrap">
            {authorizationUrl}
          </pre>
        </CardContent>
      </Card>
    </PageShell>
  );
};

export const AuthorizationStartExpiredView = ({
  message,
}: {
  message: string;
}) => (
  <PageShell>
    <Alert>
      <TimerIcon />
      <AlertTitle>Authorization link unavailable</AlertTitle>
      <AlertDescription>{message}</AlertDescription>
    </Alert>
  </PageShell>
);

const PageShell = ({ children }: { children: React.ReactNode }) => (
  <main className="mx-auto flex w-full max-w-md flex-col justify-center gap-6 px-6 py-16">
    {children}
  </main>
);
