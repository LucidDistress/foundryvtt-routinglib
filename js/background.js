let pathfindingJobs;
let timeout;

export function initializeBackground() {
	// TODO pathfindingJobs would ideally be a ring buffer, but it likely doesn't matter much
	pathfindingJobs = [];
	timeout = null;
}

export function createAsyncPathfinder(pathfinder) {
	const job = {pathfinder};
	const promise = new Promise((resolve, reject) => {
		job.resolve = resolve;
		job.reject = reject;
	});
	job.promise = promise;
	pathfindingJobs.push(job);
	scheduleBackgroundTask();
	return promise;
}

export function cancelJob(promise) {
	for (const [i, job] of pathfindingJobs.entries()) {
		if (job.promise === promise) {
			// Detach first; a failing free must never leave the job runnable.
			pathfindingJobs.splice(i, 1);
			if (!pathfindingJobs.length && timeout !== null) {
				window.clearTimeout(timeout);
				timeout = null;
			}
			try { job.pathfinder.free(); }
			catch (error) { job.reject(error); }
			return true;
		}
	}
	return false;
}

export function resetJobs() {
	for (const job of [...pathfindingJobs]) {
		try { job.pathfinder.reset(); }
		catch (error) {
			pathfindingJobs.splice(pathfindingJobs.indexOf(job), 1);
			try { job.pathfinder.free(); } catch { /* Preserve the reset error. */ }
			job.reject(error);
		}
	}
}

// Scene changes invalidate the request, rather than rerunning it in another scene.
export function invalidateJobs() {
	if (timeout !== null) window.clearTimeout(timeout);
	timeout = null;
	for (const job of pathfindingJobs.splice(0)) {
		try { job.pathfinder.free(); job.resolve(null); }
		catch (error) { job.reject(error); }
	}
}

function scheduleBackgroundTask() {
	if (timeout === null && pathfindingJobs.length) {
		timeout = window.setTimeout(asyncPathfindingTask, 0);
	}
}

function asyncPathfindingTask() {
	timeout = null;
	const deadline = Date.now() + 10;
	while (pathfindingJobs.length && Date.now() < deadline) {
		const job = pathfindingJobs[0];
		let result;
		let failed = false;
		let error;
		try {
			// Native movement checks can be expensive. Yield between steps, not
			// only after a fixed batch of twenty checks. A single step is indivisible.
			for (let i = 0; i < 20 && result === undefined && Date.now() < deadline; i++) result = job.pathfinder.step();
			if (result !== undefined && result !== null) result = job.pathfinder.postProcessResult(result);
		} catch (e) {
			failed = true;
			error = e;
		}
		if (failed || result !== undefined) {
			pathfindingJobs.shift();
			try { job.pathfinder.free(); }
			catch (e) { failed = true; error ??= e; }
			if (failed) job.reject(error);
			else job.resolve(result);
		}
	}
	scheduleBackgroundTask();
}
