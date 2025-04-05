( function () {

	class JSONPBLoader extends THREE.Loader {
		constructor(manager=undefined){
			super(manager);
		}
		load( url, onLoad, onProgress, onError ) {
			const scope = this;
			const loader = new THREE.FileLoader( this.manager );
			loader.setPath( this.path );
			//loader.setResponseType( 'arraybuffer' );
			loader.load( url, function ( text ) {

				try {

					onLoad( scope.parse( text ) );

				} catch ( e ) {

					if ( onError ) {

						onError( e );

					} else {

						console.error( e );

					}

					scope.manager.itemError( url );

				}

			}, onProgress, onError );

		}

		parse( data ) {
			const parsedData = JSON.parse(data);
			const points = parsedData.points;
			const boxes = parsedData.boxes;
			const vertices = new Float32Array(points.flat());
            // get points
            var geometry = new THREE.BufferGeometry();
            geometry.setAttribute(
                "position",
                new THREE.Float32BufferAttribute(vertices, 3)
            );
			
			var boxMeshes = [];
			boxes.forEach(box => {
				const [x, y, z, dx, dy, dz, rotation] = box;
				const geometry = new THREE.BoxGeometry(dx, dy, dz);
				const material = new THREE.MeshBasicMaterial({ color: 0x00ff00, wireframe: true });
				const boxMesh = new THREE.Mesh(geometry, material);
				boxMesh.position.set(x, y, z);
				boxMesh.rotation.z = rotation;
				boxMeshes.push(boxMesh);
			});
			return {geometry: geometry, boxMeshes: boxMeshes};

		}

	}

	THREE.JSONPBLoader = JSONPBLoader;

} )();