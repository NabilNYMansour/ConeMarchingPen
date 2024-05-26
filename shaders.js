const glsl = (x) => x[0]; // Dummy function to enable syntax highlighting for glsl code

// ----------------- Uniforms Code ----------------- //
export const uniformsCode = glsl`
precision mediump float;

// From CPU
uniform vec3 u_clearColor;

uniform float u_eps;
uniform float u_maxDis;
uniform int u_maxSteps;

uniform vec3 u_camPos;
uniform mat4 u_camToWorldMat;
uniform mat4 u_camInvProjMat;
uniform float u_camTanFov;
uniform float u_camPlaneSubdivisions;

uniform vec3 u_lightDir;
uniform vec3 u_lightColor;

uniform float u_diffIntensity;
uniform float u_specIntensity;
uniform float u_shininess;
uniform float u_ambientIntensity;

uniform bool u_useConeMarching;
uniform int u_sdfLOD;
uniform bool u_showConeMarchingEdges;
`

// ----------------- Marching Code ----------------- //
export const marchCode = glsl`
float sphereFold(vec4 z, float minR, float maxR, float bloatFactor) { // bloat = 1 will not change size.
    float r2 = dot(z.xyz, z.xyz);
    return max(maxR / max(minR, r2), bloatFactor);
}
void boxFold(inout vec4 z, vec3 r) {
    z.xyz = clamp(z.xyz, -r, r) * 2.0 - z.xyz;
}

float de_box(vec4 p, vec3 s) {
    vec3 a = abs(p.xyz) - s;
    return (min(max(max(a.x, a.y), a.z), 0.0) + length(max(a, 0.0))) / p.w;
}

float mandleBox(vec3 pos) {
    vec4 p = vec4(pos, 1);
    p *= 4.;
    vec4 o = p;
    for (int i = 0; i < u_sdfLOD; ++i) {
        boxFold(p, vec3(1., 1., 1.0));
        p *= sphereFold(p, 0., 1., 1.0) * 2.;
        p += o;
    }

    return de_box(p, vec3(10, 10, 10));
}

float scene(vec3 p) {
	return mandleBox(p);
}

vec3 sceneNormal(vec3 p) // from https://iquilezles.org/articles/normalsSDF/
{
    vec3 n = vec3(0, 0, 0);
    vec3 e;
    for(int i = 0; i < 4; i++) {
     e = 0.5773 * (2.0 * vec3((((i + 3) >> 1) & 1), ((i >> 1) & 1), (i & 1)) - 1.0);
     n += e * scene(p + e * u_eps);
    }
    return normalize(n);
}

vec3 sceneCol(vec3 p) {
    return vec3(1.0, 0.5, 0.5);
}

float rayMarch(float startDis, int stepsTaken, vec3 ro, vec3 rd)
{
    float d = startDis; // total distance travelled
    float cd; // current scene distance
    vec3 p; // current position of ray

    for (int i = stepsTaken; i < u_maxSteps; ++i) { // main loop
        p = ro + d * rd; // calculate new position
        cd = scene(p); // get scene distance
        
        // if we have hit anything or our distance is too big, break loop
        if (cd < u_eps || d >= u_maxDis) break;

        // otherwise, add new scene distance to total distance
        d += cd;
    }

    return d; // finally, return scene distance
}

struct March {
    float dis;
    int steps;
};

March coneMarch(vec3 cro, vec3 crd)
{
    float d = 0.; // total distance travelled
    float cd; // current scene distance
    float ccr; // current cone radius
    vec3 p; // current position of ray
    int i = 0; // steps iter

    for (;i < u_maxSteps; ++i) { // main loop
        p = cro + d * crd; // calculate new position
        cd = scene(p); // get scene distance
        ccr = (d * u_camTanFov)*2. / u_camPlaneSubdivisions; // calculate cone radius
        
        // if current distance is less than cone radius with some padding or our distance is too big, break loop
        if (cd < ccr*1.25 || d >= u_maxDis) break;

        // otherwise, add new scene distance to total distance
        d += cd;
    }

    return March(d, i); // finally, return scene distance
}
`

// ----------------- Vertex Shader ----------------- //
export const vertCode = glsl`
// to send to fragment shader
out vec2 vUv;
out float vDisTravelled;
flat out int vSteps;

void main() {
    // Compute view direction in world space
    vec4 worldPos = modelViewMatrix * vec4(position, 1.0);
    vec3 viewDir = normalize(-worldPos.xyz);

    // Output vertex position
    gl_Position = projectionMatrix * worldPos;

    // Output UV
    vUv = uv;

    // Cone marching
    vDisTravelled = 0.;
    vSteps = 0;
    if (u_useConeMarching) {
        vec3 cro = u_camPos; // cone ray origin
        vec3 crd = (u_camInvProjMat * vec4(uv*2.-1., 0, 1)).xyz; // cone ray direction
        crd = (u_camToWorldMat * vec4(crd, 0)).xyz;
        crd = normalize(crd);
        March result = coneMarch(cro, crd); // cone march
        vDisTravelled = result.dis; // update distance travelled
        vSteps = result.steps; // update steps taken
    }
}`

// ----------------- Fragment Shader ----------------- //
export const fragCode = glsl`
// From vertex shader
in vec2 vUv;
in float vDisTravelled;
flat in int vSteps;

void main() {
    // If distance travelled is too big, clear color
    if (u_showConeMarchingEdges && vDisTravelled >= u_maxDis) {
        gl_FragColor = vec4(u_clearColor,1);
        return;
    }
    // Get UV from vertex shader
    vec2 uv = vUv.xy;

    // Get ray origin and direction from camera uniforms
    vec3 ro = u_camPos;
    vec3 rd = (u_camInvProjMat * vec4(uv*2.-1., 0, 1)).xyz;
    rd = (u_camToWorldMat * vec4(rd, 0)).xyz;
    rd = normalize(rd);

    // Ray marching and find total distance travelled
    float disTravelled = rayMarch(vDisTravelled, vSteps, ro, rd); // use normalized ray

    if (disTravelled >= u_maxDis) { // if ray doesn't hit anything
        gl_FragColor = vec4(u_clearColor * (u_useConeMarching ? 2. : 1.),1);
    } else { // if ray hits something
        // Calculate Diffuse model
        vec3 hp = ro + disTravelled * rd; // Find the hit position
        vec3 n = sceneNormal(hp); // Get normal of hit point

        float dotNL = dot(n, u_lightDir);
        float diff = max(dotNL, 0.0) * u_diffIntensity;
        float spec = pow(diff, u_shininess) * u_specIntensity;
        float ambient = u_ambientIntensity;
        
        vec3 color = u_lightColor * (sceneCol(hp) * (spec + ambient + diff));
        gl_FragColor = vec4(color,1); // color output
    }
}
`