import * as API from "../web-ifc-js/web-ifc-api";
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls';
import { GeometryBuffer } from "../web-ifc-interop/gen/Types";
import * as IfcSchema from "../web-ifc-schema/ifc2x4";

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera( 45, window.innerWidth / window.innerHeight, 0.1, 1000 );
const renderer = new THREE.WebGLRenderer({ antialias: true });
let controls;

function GetSubArray(heap, startPtr, sizeBytes)
{
    return heap.subarray(startPtr / 4, startPtr / 4 + sizeBytes);
}

function IfcGeometryToBuffer(vertexData: Float32Array, indexData: Uint32Array): THREE.BufferGeometry
{
    const geometry = new THREE.BufferGeometry();

    const interleavedBuffer32 = new THREE.InterleavedBuffer( vertexData, 6 );

    geometry.setAttribute( 'position', new THREE.InterleavedBufferAttribute( interleavedBuffer32, 3, 0 ) );
    geometry.setAttribute( 'normal', new THREE.InterleavedBufferAttribute( interleavedBuffer32, 3, 3 ) );
    let index = [];
    for (let i = 0; i < indexData.length; i++)
    {
        index[i] = indexData[i];
    }

    geometry.setIndex(index);

    return geometry;
}

function AddPlacedGeometry(geometry: THREE.BufferGeometry, matrix: any, color: any)
{
    let col = new THREE.Color(color.x, color.y, color.z);
    const material = new THREE.MeshPhongMaterial( { color: "white" } );
    if (color.w !== 1)
    {
        //material.transparent = true;
        //material.opacity = color.w;
    }
    let mesh = new THREE.Mesh( geometry, material );
    const m = new THREE.Matrix4();
    m.fromArray(matrix);
    m.elements[15 - 3] *= 0.001;
    m.elements[15 - 2] *= 0.001;
    m.elements[15 - 1] *= 0.001;
    mesh.matrix = m;
    mesh.matrixAutoUpdate = false;

    scene.add( mesh );
}

async function LoadModel(data: Uint8Array)
{
    let start = API.ms();
    let modelID = API.OpenModel("example.ifc", data);
    let time = API.ms() - start;
    console.log(`Opening model took ${time} ms`);

    let startGeomTime = API.ms();
    let flatMeshes: any = API.LoadAllGeometry(modelID);
    let endGeomTime = API.ms();
    let size = flatMeshes.size();
    console.log(`Loaded ${size} flatMeshes`);
    //@ts-ignore
    let m: any = Module;
    for (let i = 0; i < size; i++)
    {
        let mesh = flatMeshes.get(i);
        let placedGeometries = mesh.geometries;
        let numPlacedGeometries = placedGeometries.size();
        for (let j = 0; j < numPlacedGeometries; j++)
        {
            let placedGeometry = placedGeometries.get(j);
            //@ts-ignore
            let ifcGeometry = Module.GetGeometry(modelID, placedGeometry.geometryExpressID);
            //console.log(ifcGeometry.GetVertexData());
            //console.log(ifcGeometry.GetVertexDataSize());
            let verts = GetSubArray(m.HEAPF32, ifcGeometry.GetVertexData(), ifcGeometry.GetVertexDataSize());
            let indices = GetSubArray(m.HEAPU32, ifcGeometry.GetIndexData(), ifcGeometry.GetIndexDataSize());
            let bufferGeometry = IfcGeometryToBuffer(verts, indices);
            AddPlacedGeometry(bufferGeometry, placedGeometry.flatTransformation, placedGeometry.color);
        }

    }
    let endUploadTime = API.ms();
    let totalGeomTime = endGeomTime - startGeomTime;
    console.log(`Loading geometry took ${totalGeomTime} ms`);
    console.log(`Uploading took ${endUploadTime - endGeomTime} ms`);
    return;

    IfcSchema.IfcElements.forEach((elementCode) => {
        let elementIDs = API.GetExpressIdsWithType(modelID, elementCode).expressIds();
        for (let i = 0; i < elementIDs.length; i++)
        {
            let elementID = elementIDs[i];
            AddDefaultGeometryForExpressID(modelID, elementID);
        }
    });
}

function AddDefaultGeometryForExpressID(modelID: number, expressID: number)
{
    let flatGeometry = API.GetFlattenedGeometry(modelID, expressID);
    let threeGeometry = IfcGeometryToThreejs(flatGeometry);
    threeGeometry.computeFaceNormals();
    
    const material = new THREE.MeshPhongMaterial( { color: 0xDDDDDD } );
    let mesh = new THREE.Mesh( threeGeometry, material );
    scene.add( mesh );
}

async function fileInputChanged()
{
    let fileInput = document.getElementById("finput");

    console.log("change");
    if (fileInput.files.length == 0)
    {
        console.log("No files selected!");
        return;
    }

    var file = fileInput.files[0];

    console.log("Waiting for wasm module");
    // await API.WaitForModuleReady();
    console.log("Done");

    var fr = new FileReader();
    fr.onload = function() {
        LoadModel(new Uint8Array(fr.result));
        fileInput.value = '';
    };
    fr.readAsArrayBuffer(file);
}

let cube;

function IfcGeometryToThreejs(buffer: GeometryBuffer): THREE.Geometry
{
    const geometry = new THREE.Geometry();

    let vertices = buffer.vertexData();
    let indices = buffer.indexData();

    // TODO: remove this hack
    let scale = 0.001;

    for (let i = 0; i < vertices.length; i += 3)
    {
        geometry.vertices.push(
            new THREE.Vector3(
                vertices[i + 0] * scale,
                vertices[i + 1] * scale,
                vertices[i + 2] * scale
            )
        );
    }

    for (let i = 0; i < indices.length; i += 3)
    {
        geometry.faces.push( 
            new THREE.Face3( 
                indices[i + 0],
                indices[i + 1],
                indices[i + 2]
            )
        );
    }

    return geometry;
}

function Init3DView()
{
    renderer.setSize( window.innerWidth * 0.9, window.innerHeight * 0.9);
    document.body.appendChild( renderer.domElement );

    controls = new OrbitControls( camera, renderer.domElement )

    const geometry = new THREE.BoxGeometry();
    const material = new THREE.MeshPhongMaterial( { color: 0xffffff } );
    cube = new THREE.Mesh( geometry, material );
    scene.add( cube );
    
    const directionalLight1 = new THREE.DirectionalLight( 0xffeeff, 0.8 );
    directionalLight1.position.set(1, 1, 1);
    scene.add( directionalLight1 );
    
    const directionalLight2 = new THREE.DirectionalLight( 0xffffff, 0.8 );
    directionalLight2.position.set(-1, 0.5, -1);
    scene.add( directionalLight2 );
    
    
    const ambientLight = new THREE.AmbientLight( 0xffffee, 0.25 );
    scene.add( ambientLight );

    scene.background = new THREE.Color(0x8cc7de)

    camera.position.z = 5;
}

function Update3DView()
{
    requestAnimationFrame( Update3DView );
    
	controls.update();

    renderer.render( scene, camera );
}

//@ts-ignore
window.InitWebIfcViewer = async () =>
{
    //@ts-ignore
    let m: any = Module;

    //@ts-ignore
    API.SetModule(m);
    //@ts-ignore
    console.log(m);
    await API.WaitForModuleReady();

    console.log(m.GetMat());

    let fileInput = document.getElementById("finput");

    fileInput.addEventListener('change', fileInputChanged);

    Init3DView();
    Update3DView();
}