import {
    createRemoteJWKSet,
    jwtVerify,
} from "jose";

const ACCESS_PROVIDER = "CLOUDFLARE_ACCESS";
const jwksByCertificateUrl = new Map();

export class AuthenticationError extends Error {
    constructor(message, status = 401) {
        super(message);
        this.name = "AuthenticationError";
        this.status = status;
    }
}
function requiredText(value, name, status = 500) {
    if (typeof value !== "string" || !value.trim()) {
        throw new AuthenticationError(`${name} is required`, status);
    }

    return value.trim();
}

function normalizeTeamDomain(value) {
    const text = requiredText(
        value,
        "CLOUDFLARE_ACCESS_TEAM_DOMAIN"
    ).replace(/\/$/, "");

    let url;

    try {
        url = new URL(text);
    } catch {
        throw new AuthenticationError(
            "CLOUDFLARE_ACCESS_TEAM_DOMAIN must be a valid URL",
            500
        );
    }

    if (url.protocol !== "https:" || url.pathname !== "/") {
        throw new AuthenticationError(
            "CLOUDFLARE_ACCESS_TEAM_DOMAIN must be an HTTPS origin",
            500
        );
    }

    return url.origin;
}

function getRemoteJwks(teamDomain) {
    const certificateUrl = `${teamDomain}/cdn-cgi/access/certs`;
    let jwks = jwksByCertificateUrl.get(certificateUrl);

    if (!jwks) {
        jwks = createRemoteJWKSet(new URL(certificateUrl));
        jwksByCertificateUrl.set(certificateUrl, jwks);
    }

    return jwks;
}

export async function verifyCloudflareAccessToken(token, {
    teamDomain,
    audience,
}) {
    const normalizedTeamDomain = normalizeTeamDomain(teamDomain);
    const normalizedAudience = requiredText(
        audience,
        "CLOUDFLARE_ACCESS_AUD"
    );

    const { payload } = await jwtVerify(
        token,
        getRemoteJwks(normalizedTeamDomain),
        {
            issuer: normalizedTeamDomain,
            audience: normalizedAudience,
            algorithms: ["RS256"],
        }
    );

    return payload;
}

export async function resolveCloudflareAccessIdentity(request, env, {
    verifyToken = verifyCloudflareAccessToken,
} = {}) {
    if (!request?.headers?.get) {
        throw new AuthenticationError("Request headers are required");
    }

    const token = request.headers.get("Cf-Access-Jwt-Assertion");

    if (!token) {
        throw new AuthenticationError("Cloudflare Access token is required");
    }

    let payload;

    try {
        payload = await verifyToken(token, {
            teamDomain: env?.CLOUDFLARE_ACCESS_TEAM_DOMAIN,
            audience: env?.CLOUDFLARE_ACCESS_AUD,
        });
    } catch (error) {
        if (error instanceof AuthenticationError) {
            throw error;
        }

        throw new AuthenticationError("Cloudflare Access token is invalid");
    }

    const subject = requiredText(payload?.sub, "Access token subject", 401);
    const email = requiredText(payload?.email, "Access token email", 401)
        .toLowerCase();

    if (payload?.type !== "app") {
        throw new AuthenticationError("Cloudflare Access application token is required");
    }

    return {
        provider: ACCESS_PROVIDER,
        subject,
        email,
        displayName: typeof payload.name === "string" && payload.name.trim()
            ? payload.name.trim()
            : email,
    };
}
