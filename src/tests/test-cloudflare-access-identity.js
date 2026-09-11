import assert from "node:assert/strict";

import {
    AuthenticationError,
    resolveCloudflareAccessIdentity,
} from "../auth/cloudflare-access-identity.js";

const env = {
    CLOUDFLARE_ACCESS_TEAM_DOMAIN: "https://example.cloudflareaccess.com",
    CLOUDFLARE_ACCESS_AUD: "audience-id",
};

await assert.rejects(
    resolveCloudflareAccessIdentity(
        new Request("https://example.com"),
        env,
        { verifyToken: async () => ({}) }
    ),
    (error) => error instanceof AuthenticationError && error.status === 401
);

let suppliedToken;
let suppliedOptions;

const identity = await resolveCloudflareAccessIdentity(
    new Request("https://example.com", {
        headers: {
            "Cf-Access-Jwt-Assertion": "signed-token",
        },
    }),
    env,
    {
        verifyToken: async (token, options) => {
            suppliedToken = token;
            suppliedOptions = options;

            return {
                type: "app",
                sub: "access-user-123",
                email: "Danny@Example.com",
                name: "Danny",
            };
        },
    }
);

assert.equal(suppliedToken, "signed-token");
assert.deepEqual(suppliedOptions, {
    teamDomain: env.CLOUDFLARE_ACCESS_TEAM_DOMAIN,
    audience: env.CLOUDFLARE_ACCESS_AUD,
});
assert.deepEqual(identity, {
    provider: "CLOUDFLARE_ACCESS",
    subject: "access-user-123",
    email: "danny@example.com",
    displayName: "Danny",
});

await assert.rejects(
    resolveCloudflareAccessIdentity(
        new Request("https://example.com", {
            headers: {
                "Cf-Access-Jwt-Assertion": "service-token",
            },
        }),
        env,
        {
            verifyToken: async () => ({
                type: "service",
                sub: "service-user",
                email: "service@example.com",
            }),
        }
    ),
    /application token is required/
);

await assert.rejects(
    resolveCloudflareAccessIdentity(
        new Request("https://example.com", {
            headers: {
                "Cf-Access-Jwt-Assertion": "bad-token",
            },
        }),
        env,
        {
            verifyToken: async () => {
                throw new Error("bad signature");
            },
        }
    ),
    /token is invalid/
);

console.log("Cloudflare Access identity test passed.");
