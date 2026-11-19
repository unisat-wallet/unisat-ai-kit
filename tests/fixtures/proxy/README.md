The certificate and private key in this directory are public, local-test fixtures only.
They authenticate mock TLS origins in `scripts/proxy-checks.mjs`; they are not production credentials.
Only the isolated test child process trusts this certificate via NODE_EXTRA_CA_CERTS.
