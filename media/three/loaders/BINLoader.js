( function () {

	class BINLoader extends THREE.Loader {
		constructor(params, manager=undefined){
			super(manager);
			this.ptFeats = params.ptFeats || 'None';
		}
		load( url, onLoad, onProgress, onError ) {
			const scope = this;
			const loader = new THREE.FileLoader( this.manager );
			loader.setPath( this.path );
			loader.setResponseType( 'arraybuffer' );
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

		parse( points ) {
            // get points
            const vertices = [];
			const colors = [];
            points = new Float32Array(points);
			var numFeats = 3;
			if (this.ptFeats !== 'None'){
				numFeats += this.ptFeats.split(' ').length;
			}
            var numPoints = points.length / numFeats;
            for (var i = 0; i < numPoints; i++)
            {
                const x = points[i * numFeats];
                const y = points[i * numFeats + 1];
                const z = points[i * numFeats + 2];
                vertices.push(x, y, z);
				
				if (this.ptFeats === 'r g b'){
					const r = points[i * numFeats + 3];
					const g = points[i * numFeats + 4];
					const b = points[i * numFeats + 5];
					colors.push( r/255, g/255, b/255 );
				}
            }
            var geometry = new THREE.BufferGeometry();
            geometry.setAttribute(
                "position",
                new THREE.Float32BufferAttribute(vertices, 3)
            );
			if ( colors.length > 0 ) {
				geometry.setAttribute( 'color', new THREE.Float32BufferAttribute( colors, 3 ) );
			}

            return geometry;

		}

	}

	THREE.BINLoader = BINLoader;

} )();