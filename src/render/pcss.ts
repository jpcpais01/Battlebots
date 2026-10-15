import * as THREE from 'three';
import { RT_MARK } from './rt';

/**
 * Contact-hardening soft shadows for the key light (percentage-closer soft shadows).
 *
 * A real light has a size, so a shadow is sharp where the caster touches the ground and spreads
 * the further the caster is from it: a robot's feet print crisp on the canvas while its head's
 * shadow is a soft blur. Ray-traced shadows get this for free; a shadow map has to search for it.
 *
 * three samples the shadow map through hardware depth comparison, which can't return the depths
 * a classic blocker search averages. Instead, the search asks the comparison itself: lifting the
 * receiver towards the light by a few set distances, the share of a disc that is still in shadow
 * says how much of what blocks it lies at least that far above. Those shares give the average
 * distance to the blockers, which sets the width of the filter, as PCSS does. Four heights of
 * four taps, then eight filtered taps (each a hardware 2×2), against the old five.
 *
 * Only the key light casts shadows, so one shared uniform describes its shadow camera; shaders
 * whose material lacks it (custom shaders) read zeros and keep three's plain filter.
 */

/** Near, far, light size (metres), 1 / (2 tan(half the shadow camera's fov)). Shared by every lit material. */
const PCSS = new Float32Array(4);
let installed = false;

const NEW_PCF = /* glsl */ `
		${RT_MARK}
		uniform vec4 uPcss;

		float pcssDepth( float z ) {
			// the shadow map's depth for a point z metres in front of the light
			return uPcss.y / ( uPcss.y - uPcss.x ) * ( 1.0 - uPcss.x / z );
		}

		float getShadow( sampler2DShadow shadowMap, vec2 shadowMapSize, float shadowIntensity, float shadowBias, float shadowRadius, vec4 shadowCoord ) {

			float shadow = 1.0;
			// (a spot light's shadow coordinate keeps the receiver's distance from the light in w)
			float zr = shadowCoord.w;

			shadowCoord.xyz /= shadowCoord.w;
			shadowCoord.z += shadowBias;

			bool inFrustum = shadowCoord.x >= 0.0 && shadowCoord.x <= 1.0 && shadowCoord.y >= 0.0 && shadowCoord.y <= 1.0;
			bool frustumTest = inFrustum && shadowCoord.z <= 1.0;

			if ( frustumTest ) {

				vec2 texelSize = vec2( 1.0 ) / shadowMapSize;
				float phi = interleavedGradientNoise( gl_FragCoord.xy ) * PI2;
				float radius = shadowRadius * texelSize.x;

				if ( uPcss.y > 0.0 && zr > uPcss.x ) {

					// blocker search: at each lift, the share of a disc as wide as a blocker that high
					// would blur, still in shadow
					float lifts[ 4 ] = float[ 4 ]( 0.06, 0.35, 1.0, 2.2 );
					float occ[ 4 ];
					for ( int k = 0; k < 4; k ++ ) {
						float dz = min( lifts[ k ], zr - uPcss.x - 0.01 );
						float ref = pcssDepth( zr - dz ) + shadowBias;
						float r = max( radius, 0.5 * uPcss.z * dz / max( zr - dz, 0.1 ) * uPcss.w / zr );
						float lit = 0.0;
						for ( int i = 0; i < 4; i ++ ) {
							lit += texture( shadowMap, vec3( shadowCoord.xy + vogelDiskSample( i, 4, phi + float( k ) ) * r, ref ) );
						}
						occ[ k ] = 1.0 - lit * 0.25;
					}
					// fully lit at the lowest lift: nothing above, or only what the filter below catches
					if ( occ[ 0 ] > 0.0 ) {
						// the average height of the blockers, from the shares between the lifts
						float sum = max( occ[ 0 ] - occ[ 1 ], 0.0 ) * 0.2 + max( occ[ 1 ] - occ[ 2 ], 0.0 ) * 0.65 + max( occ[ 2 ] - occ[ 3 ], 0.0 ) * 1.6 + occ[ 3 ] * 3.0;
						float total = max( occ[ 0 ] - occ[ 1 ], 0.0 ) + max( occ[ 1 ] - occ[ 2 ], 0.0 ) + max( occ[ 2 ] - occ[ 3 ], 0.0 ) + occ[ 3 ];
						float dBlock = clamp( sum / max( total, 1e-3 ), 0.02, zr - uPcss.x );
						// half the penumbra's width where the receiver is, as a share of the shadow map
						float pen = 0.5 * uPcss.z * dBlock / max( zr - dBlock, 0.1 ) * uPcss.w / zr;
						// (never tighter than three's own filter: a narrower one lets the shadow map's
						// texel steps show as stripes on surfaces the light grazes)
						radius = clamp( pen, radius, texelSize.x * 28.0 );
					}

					shadow = 0.0;
					for ( int i = 0; i < 8; i ++ ) {
						shadow += texture( shadowMap, vec3( shadowCoord.xy + vogelDiskSample( i, 8, phi ) * radius, shadowCoord.z ) );
					}
					shadow *= 0.125;

				} else {

					shadow = (
						texture( shadowMap, vec3( shadowCoord.xy + vogelDiskSample( 0, 5, phi ) * radius, shadowCoord.z ) ) +
						texture( shadowMap, vec3( shadowCoord.xy + vogelDiskSample( 1, 5, phi ) * radius, shadowCoord.z ) ) +
						texture( shadowMap, vec3( shadowCoord.xy + vogelDiskSample( 2, 5, phi ) * radius, shadowCoord.z ) ) +
						texture( shadowMap, vec3( shadowCoord.xy + vogelDiskSample( 3, 5, phi ) * radius, shadowCoord.z ) ) +
						texture( shadowMap, vec3( shadowCoord.xy + vogelDiskSample( 4, 5, phi ) * radius, shadowCoord.z ) )
					) * 0.2;

				}

			}

			return mix( 1.0, shadow, shadowIntensity );

		}
`;

/** Where three's PCF filter starts and ends in its shadow chunk (r186). */
const START = 'float getShadow( sampler2DShadow shadowMap,';
const END = '#elif defined( SHADOWMAP_TYPE_VSM )';

/**
 * Swap three's shadow filter for the contact-hardening one. Must run before any lit material
 * compiles. Returns false (and changes nothing) if three's chunk isn't laid out as expected.
 */
export function installPCSS(): boolean {
  if (installed) return true;
  const chunk = THREE.ShaderChunk.shadowmap_pars_fragment;
  const a = chunk.indexOf(START);
  const b = chunk.indexOf(END);
  if (a < 0 || b < a) return false;
  // the replacement runs to the function's closing brace, just before the VSM branch
  const cut = chunk.lastIndexOf('}', b) + 1;
  if (cut <= a || chunk.indexOf(START, a + 1) >= 0) return false;
  (THREE.ShaderChunk as Record<string, string>).shadowmap_pars_fragment = chunk.slice(0, a) + NEW_PCF.trim() + chunk.slice(cut);
  // every built-in lit material picks up the shared uniform (cloning keeps a typed array by reference)
  for (const id of ['lambert', 'phong', 'standard', 'physical', 'toon', 'shadow'] as const) THREE.ShaderLib[id].uniforms.uPcss = { value: PCSS };
  installed = true;
  return true;
}

/** Describe the key light's shadow camera for this frame. `size`: the light's width in metres. */
export function updatePCSS(light: THREE.SpotLight, size: number) {
  if (!installed) return;
  const s = light.shadow;
  const near = s.camera.near;
  const far = light.distance || s.camera.far;
  PCSS[0] = near;
  PCSS[1] = light.castShadow ? far : 0;
  PCSS[2] = size;
  PCSS[3] = 1 / (2 * Math.tan(light.angle * s.focus));
}
