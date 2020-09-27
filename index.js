const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const core = require('@actions/core');
const cache = require('@actions/cache');
const duration = require('parse-duration');


(async () => {

  // read and validate inputs
  const dockerBuildArgs = process.env["INPUT_ARGS"] || ""
  const cacheKey = process.env["INPUT_CACHE_KEY"] || ""
  const expiresStr = process.env["INPUT_EXPIRES"] || ""
  const runnerTemp = process.env['RUNNER_TEMP'] || ""

  if (runnerTemp == "") {
    core.setFailed("RUNNER_TEMP env var missing")
    return
  }

  if (dockerBuildArgs == "") {
    core.setFailed("docker build args missing")
    return
  }

  // parse docker build args
  const dockerBuildTags = getDockerBuildTags(dockerBuildArgs)
  if (dockerBuildTags.length == 0) {
    core.setFailed("docker build args require at least one --tag")
    return
  }

  const primaryKey = sha256(`${cacheKey} ${dockerBuildArgs} ${expiresStr}`)
  const cachePath = path.join(runnerTemp, "cached-docker-build", primaryKey)
  let cacheHit = false

  core.info(`Cached key: ${primaryKey}`)

  // try to restore cachePath from Github cache
  try {
    const cacheKey = await cache.restoreCache([cachePath], primaryKey, []);
    if (cacheKey) {
      cacheHit = true
    }
  } catch (error) {
    if (error.name === cache.ValidationError.name) {
      abort(error.message);
    } else {
      core.error(error.message);
    }
  }

  // load docker image if it was cached and not expired
  if (cacheHit) {
    let expires = 0;
    try {
      expires = Number(fs.readFileSync(path.join(cachePath, ".meta.expires")));
    } catch (err) {}

    if (expires > 0 && Date.now() >= expires) {
      core.info("Cache is expired")
    } else {
      exec(`docker load -i ${path.join(cachePath, "image.tar")}`, false);
      core.info(`${dockerBuildTags.join(", ")} successfully loaded from cache`)
      return
    }
  }

  // docker build/save and store meta data in cache path
  exec(`docker build ${dockerBuildArgs}`, true);
  exec(`mkdir -p ${cachePath}`, false);
  exec(`docker save -o ${path.join(cachePath, "image.tar")} ${dockerBuildTags.join(" ")}`, false);

  // parse expiresStr into timestamp
  let expires = 0
  if (expiresStr != "") {
    expires = Date.now() + duration(expiresStr, "ms")
  }

  if (expires > 0) {
    fs.writeFileSync(path.join(cachePath, ".meta.expires"), expires)
  }

  // save cache
  try {
    await cache.saveCache([cachePath], primaryKey);
  } catch (error) {
    core.error(error.message);
  }

  if (expires > 0) {
    let expiresDate = new Date(expires)
    core.info(`Cache expires ${expiresDate.toUTCString()}`)
  }

})();


function exec(cmd, log) {
  try {
    if(log) {
      core.info(cmd)
      execSync(cmd, {stdio: "inherit"})
    } else {
      execSync(cmd, {stdio: "ignore"})
    }
  } catch(err) {
    if(!log) {
      core.error(cmd)
    }
    abort(err.message)
  }
}

function abort(msg) {
  core.setFailed(msg)
  process.exit(process.exitCode)
}

// getDockerBuildTag parses `-t` or `--tag` from given `docker build` command.
function getDockerBuildTags(cmd) {
  let tags = []
  let args = require("yargs-parser")(cmd)

  if (args["t"]) {
    tags.push(args["t"])
  }

  if (args["tag"]) {
    tags.push(args["tag"])
  }

  return tags.flat()
}

// sha256 returns sha256(input) hex string
function sha256(input) {
  return require('crypto').createHash('sha256').update(input, 'utf8').digest('hex');
}
