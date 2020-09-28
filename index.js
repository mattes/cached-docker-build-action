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
  const runnerTemp = process.env['RUNNER_TEMP'] || ""

  if (runnerTemp == "") {
    abort("RUNNER_TEMP env var missing")
  }

  if (dockerBuildArgs == "") {
    abort("docker build args missing")
  }

  // parse docker build args
  const dockerBuildTags = getDockerBuildTags(dockerBuildArgs)
  if (dockerBuildTags.length == 0) {
    abort("docker build args require at least one --tag")
  }

  // parse dockerfile from args
  const dockerfile = getDockerfile(dockerBuildArgs)
  if (dockerfile == "") {
    abort("docker build args require --file")
  }

  const primaryKey = sha256(`${cacheKey} ${dockerBuildArgs} ${sha256File(dockerfile)}`)
  const cachePath = path.join(runnerTemp, "cached-docker-build", primaryKey)
  let cacheHit = false

  core.info(`Cache Key Hash: ${primaryKey}`)

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

  // load docker image if it was cached
  if (cacheHit) {
    exec(`docker load -i ${path.join(cachePath, "image.tar")}`, false);
    core.info(`${dockerBuildTags.join(", ")} successfully loaded from cache`)
    return
  }

  // docker build/save and store meta data in cache path
  exec(`docker build ${dockerBuildArgs}`, true);
  exec(`mkdir -p ${cachePath}`, false);
  exec(`docker save -o ${path.join(cachePath, "image.tar")} ${dockerBuildTags.join(" ")}`, false);

  // save cache
  try {
    await cache.saveCache([cachePath], primaryKey);
  } catch (error) {
    core.error(error.message);
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

function getDockerfile(cmd) {
  let args = require("yargs-parser")(cmd)
  if (args["f"]) {
    return args["f"]
  }

  if (args["file"]) {
    return args["file"]
  }

  return ""
}

// sha256 returns sha256(input) hex string
function sha256(input) {
  return require('crypto').createHash('sha256').update(input, 'utf8').digest('hex');
}

function sha256File(filename) {
  return sha256(fs.readFileSync(filename))
}
