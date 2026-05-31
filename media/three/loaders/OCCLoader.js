( function () {

	class OCCLoader extends THREE.Loader {
		constructor(manager = undefined) {
			super(manager);
		}

		load(url, onLoad, onProgress, onError) {
			const scope = this;
			const loader = new THREE.FileLoader(this.manager);
			loader.setPath(this.path);
			loader.setResponseType('arraybuffer');
			loader.load(url, function (buffer) {
				try {
					onLoad(scope.parse(buffer));
				} catch (e) {
					if (onError) {
						onError(e);
					} else {
						console.error(e);
					}
					scope.manager.itemError(url);
				}
			}, onProgress, onError);
		}

		parse(buffer) {
			const npy = this.parseNpy(buffer);
			const shape = npy.shape;
			if (shape.length !== 2 || (shape[1] !== 3 && shape[1] !== 4)) {
				throw new Error('NumPy occupancy expects an [N,3] or [N,4] array');
			}

			const count = shape[0];
			const stride = shape[1];
			const positions = new Float32Array(count * 3);
			const scalars = stride === 4 ? new Float32Array(count) : null;
			for (let i = 0; i < count; i++) {
				const dstOffset = i * 3;
				const x = this.getArrayValue(npy, i, 0);
				const y = this.getArrayValue(npy, i, 1);
				positions[dstOffset] = x;
				positions[dstOffset + 1] = y;
				positions[dstOffset + 2] = this.getArrayValue(npy, i, 2);
				if (scalars !== null) {
					scalars[i] = this.getArrayValue(npy, i, 3);
				}
			}

			const geometry = new THREE.BufferGeometry();
			geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));

			return {
				geometry: geometry,
				occupancy: {
					count: count,
					positions: positions,
					scalars: scalars,
				}
			};
		}

		getArrayValue(npy, row, column) {
			const rows = npy.shape[0];
			const cols = npy.shape[1];
			const offset = npy.fortranOrder
				? row + rows * column
				: row * cols + column;
			return Number(npy.data[offset]);
		}

		parseNpy(buffer) {
			const view = new DataView(buffer);
			const magic = String.fromCharCode.apply(null, Array.from(new Uint8Array(buffer, 0, 6)));
			if (magic !== '\x93NUMPY') {
				throw new Error('Occupancy loader expects a NumPy .npy payload');
			}

			const major = view.getUint8(6);
			const offset = 8;
			let headerLength;
			let dataOffset;
			if (major === 1) {
				headerLength = view.getUint16(offset, true);
				dataOffset = 10 + headerLength;
			} else if (major === 2 || major === 3) {
				headerLength = view.getUint32(offset, true);
				dataOffset = 12 + headerLength;
			} else {
				throw new Error(`Unsupported .npy version: ${major}`);
			}

			const headerStart = dataOffset - headerLength;
			const headerBytes = new Uint8Array(buffer, headerStart, headerLength);
			const header = new TextDecoder('latin1').decode(headerBytes);
			const descrMatch = /'descr':\s*'([^']+)'/.exec(header);
			const fortranMatch = /'fortran_order':\s*(True|False)/.exec(header);
			const shapeMatch = /'shape':\s*\(([^)]*)\)/.exec(header);
			if (!descrMatch || !fortranMatch || !shapeMatch) {
				throw new Error('Failed to parse .npy header');
			}

			const shape = shapeMatch[1]
				.split(',')
				.map(part => part.trim())
				.filter(part => part.length > 0)
				.map(part => Number(part));
			const TypedArray = this.getTypedArray(descrMatch[1]);
			return {
				shape: shape,
				fortranOrder: fortranMatch[1] === 'True',
				data: new TypedArray(buffer, dataOffset),
			};
		}

		getTypedArray(descr) {
			switch (descr) {
				case '|u1':
				case '<u1':
					return Uint8Array;
				case '<i2':
					return Int16Array;
				case '<u2':
					return Uint16Array;
				case '<i4':
					return Int32Array;
				case '<u4':
					return Uint32Array;
				case '<i8':
					return BigInt64Array;
				case '<u8':
					return BigUint64Array;
				case '<f4':
					return Float32Array;
				case '<f8':
					return Float64Array;
				default:
					throw new Error(`Unsupported .npy dtype: ${descr}`);
			}
		}
	}

	THREE.OCCLoader = OCCLoader;

} )();
