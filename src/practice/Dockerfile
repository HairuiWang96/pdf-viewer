# Practice copy of doc-viewer's Dockerfile, pasted on 2026-10-28. Only here to
# read and discuss: nothing in this repo builds it, and the payload/ folder it
# copies from is made by doc-viewer's pipeline, not here.
FROM public.ecr.aws/amazonlinux/amazonlinux:2023-minimal as base

# microdnf: the package installer on Amazon Linux's minimal image (like npm,
# but for the operating system). A smaller "micro" version of dnf, the usual
# one on Red Hat-style Linux; Ubuntu uses apt, Alpine uses apk.
#   install -y     install, answering "yes" itself (a build can't wait for input)
#   nodejs24-npm   Node.js 24 and npm
#   shadow-utils   groupadd / useradd, for the user created below
#   clean all      delete the downloaded package files: a smaller image
RUN microdnf install -y nodejs24-npm shadow-utils && \
    microdnf clean all

# Create a user for the app to run as, instead of root (the all-powerful
# admin). USER appuser below makes the app run as it, so someone who breaks
# into the app gets only this user's limited rights. A standard container
# security practice.
#   groupadd -r appgroup   a system group (for a program, not a person)
#   useradd -r ... appuser a system user, not for a person to log in
#     -g appgroup          in the appgroup group
#     -d /app              its home folder is /app, where the app lives
#     -s /sbin/nologin     no login shell: nobody can log in as it
#   &&                     run the second command only if the first worked
# Both commands come from shadow-utils, installed above.
RUN groupadd -r appgroup && useradd -r -g appgroup -d /app -s /sbin/nologin appuser

WORKDIR /app

# Give the /app folder to the app's user. WORKDIR created it owned by root;
# the app runs as appuser, so this lets it create files there (logs, temp).
#   chown               change owner
#   appuser:appgroup    the new owner: user appuser, group appgroup
#   -R                  the folder and everything inside it
# /app is still empty here. The files COPY'd in below are owned by root, so
# appuser can read and run them but not change them: all it needs, and safer.
# If it ever had to write to them: COPY --chown=appuser:appgroup ...
RUN chown -R appuser:appgroup /app

FROM base as runner

ENV PORT=5173

WORKDIR /app

# payload/: the ready-to-run app ("payload" = the cargo being delivered). Not
# made here: the deploy pipeline most likely installs and builds the app
# (npm ci, npm run build), puts the results in payload/, then runs docker
# build. So this file builds nothing, it only packs up what was built: a
# smaller image, quicker to build, with no build tools inside. (Inferred from
# these COPY lines; the pipeline's config file would show exactly.)
#   node_modules   installed packages
#   dist           the built app
#   package*.json  package.json and package-lock.json
COPY payload/node_modules ./node_modules
COPY payload/dist ./dist
COPY payload/package*.json ./

USER appuser
EXPOSE $PORT

ENV OTEL_ENABLED=false
ENV NODE_ENV=production

RUN echo "=== CHECKING BUILD OUTPUT ===" \
  && ls -la ./dist

# TODO: make this a prod server. temp for testing pipeline deploy
CMD ["node", "./dist/server.ts"]
