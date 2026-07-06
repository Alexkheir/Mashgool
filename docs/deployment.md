# Deployment Runbook

How to provision the production server, wire up CI/CD, and deploy Mashgool.
The pipeline itself is `.github/workflows/deploy.yml`; this document covers
everything that happens **once** (server setup) plus the recovery procedures.

---

## 1. Hosting: free tier for the testing phase

Decision (2026-07-05): we self-host everything on one VM, including PostgreSQL
in Docker. For the testing phase we use a free tier; a paid VPS (Hetzner /
DigitalOcean) can replace it later without any pipeline changes — only the
GitHub secrets change.

### Oracle Cloud Always Free (recommended free option)

- **What you get (verified 2026-07):** Ampere A1 ARM64 VMs, up to **2 OCPU /
  12 GB RAM total** (Oracle quietly halved this from 4/24 in June 2026), plus
  2×AMD x86 micro VMs (1/8 OCPU, 1 GB — too small for our stack), 200 GB block
  storage, 10 TB egress/month. No time limit, no card charge (card required
  for identity only).
- **Use one A1 VM with 2 OCPU / 12 GB** — comfortable for web + api + db +
  nginx.
- **ARM64 matters:** the VM is `linux/arm64`. Our CI already builds
  multi-arch images (amd64 + arm64), so nothing extra is needed.
- Caveats: free-tier capacity in popular regions is often "out of stock" —
  pick your home region carefully at signup (it cannot be changed); idle
  instances can be reclaimed (our stack is never idle once monitoring exists).

### DuckDNS (free domain)

- Register at duckdns.org (sign in with GitHub) → claim `mashgool.duckdns.org`
  (or similar) → point it at the VM's public IP.
- Keep the IP fresh with a cron on the VPS (every 5 min):

  ```bash
  */5 * * * * curl -s "https://www.duckdns.org/update?domains=<SUBDOMAIN>&token=<DUCKDNS_TOKEN>&ip=" >/dev/null
  ```

- Let's Encrypt works fine with `*.duckdns.org` (it's on the Public Suffix
  List, so rate limits are per-subdomain).

---

## 2. Provision the server (once)

Assumes Ubuntu LTS 24.04. On Oracle, create the instance with the Ubuntu
image, upload your SSH public key, and open ports 80/443 in the VCN Security
List (Oracle's network firewall — **in addition to** UFW below; forgetting
this is the #1 "why can't I reach my server" cause on OCI).

```bash
# --- as the initial user (ubuntu / opc) ---
sudo adduser deploy
sudo usermod -aG sudo deploy
sudo mkdir -p /home/deploy/.ssh
sudo cp ~/.ssh/authorized_keys /home/deploy/.ssh/
sudo chown -R deploy:deploy /home/deploy/.ssh
sudo chmod 700 /home/deploy/.ssh && sudo chmod 600 /home/deploy/.ssh/authorized_keys

# --- harden SSH ---
sudo sed -i 's/^#\?PasswordAuthentication.*/PasswordAuthentication no/' /etc/ssh/sshd_config
sudo sed -i 's/^#\?PermitRootLogin.*/PermitRootLogin no/' /etc/ssh/sshd_config
sudo systemctl restart ssh

# --- firewall ---
sudo ufw allow 22/tcp && sudo ufw allow 80/tcp && sudo ufw allow 443/tcp
sudo ufw enable
# Oracle images ship iptables rules that block 80/443 even with UFW open:
sudo iptables -I INPUT -p tcp --dport 80 -j ACCEPT
sudo iptables -I INPUT -p tcp --dport 443 -j ACCEPT
sudo netfilter-persistent save

# --- Docker (as deploy user from here on) ---
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker deploy    # re-login to take effect
sudo systemctl enable docker

# --- app directory ---
sudo mkdir -p /opt/mashgool && sudo chown deploy:deploy /opt/mashgool
sudo mkdir -p /var/www/certbot
```

Generate a **dedicated deploy key pair** on your machine (never reuse your
personal key): `ssh-keygen -t ed25519 -f mashgool-deploy -C mashgool-deploy`.
Append `mashgool-deploy.pub` to `/home/deploy/.ssh/authorized_keys`; the
private key becomes the `VPS_SSH_KEY` GitHub secret.

---

## 3. SSL certificate (once, before first deploy)

Chicken-and-egg: nginx won't start without certs, certbot's webroot needs a
running web server. Solve it by issuing the first certificate in standalone
mode **before** the stack exists (port 80 is still free):

```bash
sudo apt-get install -y certbot
sudo certbot certonly --standalone -d <DOMAIN> --agree-tos -m alexkheir307@gmail.com --no-eff-email
```

Renewals then run against the live nginx via the webroot that
`docker-compose.prod.yml` mounts read-only:

```bash
# /etc/letsencrypt/renewal/<DOMAIN>.conf — switch authenticator after first deploy:
sudo certbot renew --dry-run \
  --webroot -w /var/www/certbot \
  --deploy-hook 'docker compose -f /opt/mashgool/docker-compose.prod.yml --env-file /opt/mashgool/.env.prod exec nginx nginx -s reload'
```

Certbot's systemd timer handles the schedule automatically; the dry run above
must pass before go-live. nginx picks up renewed certs via the deploy hook.

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

### Go-live validation checklist (Phase 0 Feature 6)

- [ ] Push to `main` triggers the workflow; all stages green
- [ ] Both images visible in GHCR with `latest` + SHA tags
- [ ] `https://<DOMAIN>` shows the hello-world page with API status **ok**
- [ ] `http://` redirects to `https://`; certificate valid in browser
- [ ] `https://<DOMAIN>/api/v1/health` returns 200
- [ ] `certbot renew --dry-run` passes
- [ ] Deliberate bad push (failing test) → pipeline red, production untouched
- [ ] Rollback procedure exercised once with a real old SHA

### ⚠️ Data safety

`postgres_data` (Docker named volume on the VPS) **is** the database. Never
run `docker compose down -v` on the server. Backups: nightly `pg_dump` → S3
(Feature 22) is the only backup layer and must exist before real data does.
