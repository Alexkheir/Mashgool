# Deployment Runbook

How to provision the production server, wire up CI/CD, and deploy Mashgool.
The pipeline itself is `.github/workflows/deploy.yml`; this document covers
everything that happens **once** (server setup) plus the recovery procedures.

---

## 1. Hosting

Decision (2026-07-05): we self-host everything on one VM, including PostgreSQL
in Docker. **Production runs on a RackNerd VPS** (~$22, x86-64/amd64, static
IP) — decided 2026-07-19, replacing the original Oracle Always Free plan.
The pipeline is provider-agnostic by design: moving to any other VPS is only
a matter of updating the GitHub secrets below, no code or workflow changes.

### RackNerd (current production host)

- x86-64/amd64 — CI's multi-arch build (amd64 + arm64) covers it natively;
  amd64 is the faster build leg on GitHub's runners.
- **Static IP** — set the DNS record once; no dynamic-DNS update cron needed
  (see DuckDNS below).
- **No cloud-level firewall** — unlike Oracle (which has a VCN Security List
  in front of the VM, blocking ports independently of the OS), RackNerd has
  nothing in front of the machine. UFW on the VM (§2) is the only firewall
  layer, and what it allows is what's actually reachable — one less place
  for "why can't I reach my server" to hide.
- RackNerd provisions the box with a root **password** login — this is the
  first thing §2 replaces with key-only access.

### Alternative: Oracle Cloud Always Free (genuinely free option)

Still viable if cost matters more than guaranteed capacity — kept here since
the pipeline doesn't care which is used.

- **What you get (verified 2026-07):** Ampere A1 ARM64 VMs, up to **2 OCPU /
  12 GB RAM total** (Oracle quietly halved this from 4/24 in June 2026), plus
  2×AMD x86 micro VMs (1/8 OCPU, 1 GB — too small for our stack), 200 GB block
  storage, 10 TB egress/month. No time limit, no card charge (card required
  for identity only).
- **ARM64 matters:** the VM is `linux/arm64` — covered by our multi-arch build.
- Caveats: free-tier capacity in popular regions is often "out of stock" —
  pick your home region carefully at signup (it cannot be changed); idle
  instances can be reclaimed; **and** it has the extra VCN firewall layer
  and (usually) a dynamic IP, so both the iptables step in §2 and the DuckDNS
  cron below apply if you choose this path — neither applies on RackNerd.

### DuckDNS (free domain)

- Register at duckdns.org (sign in with GitHub) → claim `mashgool.duckdns.org`
  → point it at the VM's public IP.
- **On a static-IP host (RackNerd): set it once, done** — no cron needed.
  On a dynamic-IP host (e.g. Oracle without a reserved IP), keep the IP fresh
  with a cron on the VPS instead (every 5 min):

  ```bash
  */5 * * * * curl -s "https://www.duckdns.org/update?domains=<SUBDOMAIN>&token=<DUCKDNS_TOKEN>&ip=" >/dev/null
  ```

- Let's Encrypt works fine with `*.duckdns.org` (it's on the Public Suffix
  List, so rate limits are per-subdomain).

---

## 2. Provision the server (once)

Assumes Ubuntu LTS. On Oracle specifically, also open ports 80/443 in the VCN
Security List (Oracle's network firewall — **in addition to** UFW below) and
run the extra `iptables`/`netfilter-persistent` lines further down; RackNerd
has neither an extra cloud firewall nor Oracle's default iptables rules, so
those steps are skipped there.

```bash
# --- as the initial user (root on RackNerd; ubuntu/opc on most other providers) ---
adduser deploy                    # interactive: creates user + home dir + password
usermod -aG sudo deploy           # admin rights (password-gated)
usermod -aG docker deploy         # once Docker is installed, below
mkdir -p /home/deploy/.ssh
# If the initial user already has authorized_keys (true on most cloud images):
cp ~/.ssh/authorized_keys /home/deploy/.ssh/
# On RackNerd, root starts with a password only, not a key — instead, paste
# your public key (ssh-ed25519 AAAA... one-liner) directly:
#   echo '<your-public-key-line>' >> /home/deploy/.ssh/authorized_keys
chown -R deploy:deploy /home/deploy/.ssh
chmod 700 /home/deploy/.ssh && chmod 600 /home/deploy/.ssh/authorized_keys

# --- harden SSH ---
sed -i 's/^#\?PasswordAuthentication.*/PasswordAuthentication no/' /etc/ssh/sshd_config
# 'no' disables root SSH entirely. If you want root kept for other admin use
# (our choice, 2026-07-19), use 'prohibit-password' instead — root can still
# log in, but key-only, same effective security against brute force:
sed -i 's/^#\?PermitRootLogin.*/PermitRootLogin prohibit-password/' /etc/ssh/sshd_config
# ^ if using prohibit-password, also copy your public key to /root/.ssh/authorized_keys
systemctl restart ssh
# Keep the current session open and open a NEW connection to verify before
# closing it — a broken sshd_config with no open session left is a lockout.

# --- firewall ---
ufw allow 22/tcp && ufw allow 80/tcp && ufw allow 443/tcp
ufw enable
# Oracle only — its images ship iptables rules that block 80/443 even with
# UFW open; not needed on RackNerd:
#   iptables -I INPUT -p tcp --dport 80 -j ACCEPT
#   iptables -I INPUT -p tcp --dport 443 -j ACCEPT
#   netfilter-persistent save

# --- Docker (as deploy user from here on) ---
curl -fsSL https://get.docker.com | sh
usermod -aG docker deploy    # re-login to take effect
systemctl enable docker      # start on boot, not just start now

# --- app directory ---
mkdir -p /opt/mashgool && chown deploy:deploy /opt/mashgool
mkdir -p /var/www/certbot
```

Generate a **dedicated deploy key pair** on your machine (never reuse your
personal key): `ssh-keygen -t ed25519 -f mashgool-deploy -C mashgool-deploy`.
Append `mashgool-deploy.pub` to `/home/deploy/.ssh/authorized_keys`; the
private key becomes the `VPS_SSH_KEY` GitHub secret. One key = one purpose:
if it ever leaks (CI logs, a repo settings breach), you revoke a single
`authorized_keys` line without touching your own personal access.

---

## 3. SSL certificate (once, before first deploy)

Chicken-and-egg: nginx needs a certificate to start, but certbot's webroot
method needs a running web server to answer the challenge. Solve it by
issuing the **first** certificate in standalone mode **before the stack
exists**, while port 80 is still free — certbot briefly runs its own
temporary server:

```bash
sudo apt-get install -y certbot
sudo certbot certonly --standalone -d <DOMAIN> --agree-tos -m alexkheir307@gmail.com --no-eff-email
```

**Immediately switch to webroot for every renewal after that** — this step
is required, not optional. Once nginx is up (§5), standalone renewal will
permanently fail: nginx now holds port 80 all the time, so certbot can't
bind it (found the hard way in Feature 6's `certbot renew --dry-run` drill —
see LEARNING.md for the full story). Re-issue once via webroot, which
rewrites the renewal config to use webroot from then on, **and** attach a
deploy hook so nginx actually reloads the new cert after future automatic
renewals (nginx loads certs into worker memory at startup — a renewed file
on disk alone doesn't get picked up otherwise):

```bash
sudo certbot certonly --webroot -w /var/www/certbot -d <DOMAIN> \
  --deploy-hook 'docker compose -f /opt/mashgool/docker-compose.prod.yml --env-file /opt/mashgool/.env.prod exec nginx nginx -s reload' \
  --force-renewal
```

(`--force-renewal` here because the cert likely isn't due yet — this run is
fixing the *method* and attaching the hook, not renewing early. It costs one
of the 5-per-week real issuances, so don't repeat it casually.)

Verify anytime, safely and for free:

```bash
sudo certbot renew --dry-run
```

Certbot's own systemd timer handles the schedule automatically from here;
the dry run must pass clean before go-live, and is worth re-running after
any change to nginx or port 80.

---

## 4. GitHub configuration

Repository **secrets** (Settings → Secrets and variables → Actions):

| Secret | Value |
|---|---|
| `VPS_HOST` | VM public IP (or the DuckDNS domain) |
| `VPS_USER` | `deploy` |
| `VPS_SSH_KEY` | contents of the private deploy key |
| `POSTGRES_PASSWORD` | long random string (`openssl rand -base64 32`) |

Repository **variables**:

| Variable | Value |
|---|---|
| `DOMAIN` | e.g. `mashgool.duckdns.org` |
| `DEPLOY_ENABLED` | `true` — the kill switch; unset/false skips the Deploy job |

Phase 1 will add: `JWT_SECRET`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`,
`CLAUDE_API_KEY`, `OPENAI_API_KEY`, `SENTRY_DSN`.

---

## 5. Deploying

Automatic: every merge to `main` runs Test → Build & Push → Deploy → smoke
check. Manual: Actions → "Deploy Mashgool" → Run workflow.

What the Deploy job does on the VPS (`/opt/mashgool`):

1. Copies `docker-compose.prod.yml` + nginx config from the repo (repo is the
   source of truth; nothing is hand-edited on the server).
2. Rewrites `.env.prod` from GitHub secrets/variables, with `IMAGE_TAG`
   pinned to the commit SHA that was just built.
3. `docker compose pull` + `up -d --no-build`, then prunes old images.

### Rollback

Images are tagged with every commit SHA, so rollback = run an older tag:

```bash
ssh deploy@<VPS_HOST>
cd /opt/mashgool
sed -i 's/^IMAGE_TAG=.*/IMAGE_TAG=<old-sha>/' .env.prod
docker compose -f docker-compose.prod.yml --env-file .env.prod up -d --no-build
```

(The next merge to `main` deploys forward again and overwrites `.env.prod`.)
Note that a **failed pipeline never touches production** — the Deploy job only
runs after Test and Build succeed, so bad pushes die in CI while the previous
images keep running.

### Go-live validation checklist (Phase 0 Feature 6) — completed 2026-07-20

- [x] Push to `main` triggers the workflow; all stages green
- [x] Both images visible in GHCR with `latest` + SHA tags
- [x] `https://<DOMAIN>` shows the hello-world page with API status **ok**
- [x] `http://` redirects to `https://`; certificate valid in browser
- [x] `https://<DOMAIN>/api/v1/health` returns 200
- [x] `certbot renew --dry-run` passes (found + fixed the standalone→webroot
      port-80 conflict; see §3 and LEARNING.md)
- [x] Deliberate bad push (failing test) → pipeline red, production untouched
      (branch `test/bad-push-drill`)
- [x] Rollback procedure exercised once with a real old SHA (`5e4e715` ←
      `14e0d04`, confirmed via a visible on-page marker, then rolled forward)

### ⚠️ Data safety

`postgres_data` (Docker named volume on the VPS) **is** the database. Never
run `docker compose down -v` on the server. Backups: nightly `pg_dump` → S3
(Feature 22) is the only backup layer and must exist before real data does.
