#!/usr/bin/env python3

import json
import os
import shutil
from pathlib import PurePath, Path
import subprocess
import tempfile
import zipfile

root = Path(__file__).resolve().parent
os.chdir(root)
wasm_pack = shutil.which("wasm-pack") or Path("~/.cargo/bin").expanduser() / ("wasm-pack.exe" if os.name == "nt" else "wasm-pack")
if not Path(wasm_pack).is_file():
	raise SystemExit("wasm-pack is required to build a release; install the Rust toolchain and wasm-pack first.")

root_files = ["module.json", "README.md", "CHANGELOG.md", "LICENSE", "TESTING-V14.md", "tools/foundry-smoke.mjs"]
wasm_files = ["gridless_pathfinding_bg.wasm", "gridless_pathfinding.js"]
output_dir = Path("artifact")
copy_everything_directories = ["js"]
if (root / "lang").is_dir():
	copy_everything_directories.append("lang")
wasm_dir = Path("wasm")
root_dir = Path(".")
rust_dir = Path("rust")
build_dir_tmp = tempfile.TemporaryDirectory()
build_dir = Path(build_dir_tmp.name)

with open("module.json", "r", encoding="utf-8") as file:
	manifest = json.load(file)

zip_root = PurePath(f'{manifest["id"]}')

filename = f'{manifest["id"]}-{manifest["version"]}.zip'

result = subprocess.run([wasm_pack, "build", "--target", "web", "--out-dir", build_dir, root_dir / rust_dir, "--locked"])
if result.returncode != 0:
	raise Exception("Wasm build failed")

# Validate the freshly generated binary before packaging it. Never publish an
# archive whose Rust source passed tests but whose JS/WASM boundary was not run.
node = shutil.which("node")
if not node:
	raise SystemExit("Node.js is required to validate the generated WASM bindings.")
subprocess.run([node, root / "tools/test-wasm.mjs", build_dir], check=True)

output_dir.mkdir(parents=True, exist_ok=True)

def write_directory(archive, d):
	for f in (root_dir / d).iterdir():
		if f.is_dir():
			write_directory(archive, f)
		else:
			assert(f.is_file())
			archive.write(f, arcname=zip_root / d / f.name)

with zipfile.ZipFile(output_dir / filename, mode="w", compression=zipfile.ZIP_DEFLATED, compresslevel=9) as archive:
	for f in root_files:
		archive.write(root_dir / f, arcname=zip_root / f)
	for d in copy_everything_directories:
		write_directory(archive, d)
	for f in wasm_files:
		archive.write(build_dir / f, arcname=zip_root / wasm_dir / f)

with zipfile.ZipFile(output_dir / filename) as archive:
	assert archive.testzip() is None, "Release archive failed its CRC check"
	required = [str(zip_root / f).replace("\\", "/") for f in root_files]
	required += [f"{zip_root}/wasm/{f}" for f in wasm_files]
	assert all(name in archive.namelist() for name in required), "Missing release assets"
	assert json.loads(archive.read(f"{zip_root}/module.json")) == manifest

print(f"Successfully built and validated {output_dir / filename}")
