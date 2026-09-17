import bpy
import os
import sys
from mathutils import Vector


ASSET_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "web", "public", "assets"))


def material(name, color, roughness=0.7, metallic=0.0):
    mat = bpy.data.materials.new(name)
    mat.diffuse_color = (*color, 1.0)
    mat.use_nodes = True
    principled = mat.node_tree.nodes.get("Principled BSDF")
    principled.inputs["Base Color"].default_value = (*color, 1.0)
    principled.inputs["Roughness"].default_value = roughness
    principled.inputs["Metallic"].default_value = metallic
    return mat


def cube(name, dimensions, location, mat):
    bpy.ops.mesh.primitive_cube_add(location=location)
    obj = bpy.context.object
    obj.name = name
    obj.dimensions = dimensions
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    obj.data.materials.append(mat)
    return obj


def cylinder(name, radius, depth, location, mat, rotation=(0, 0, 0), vertices=32):
    bpy.ops.mesh.primitive_cylinder_add(vertices=vertices, radius=radius, depth=depth, location=location, rotation=rotation)
    obj = bpy.context.object
    obj.name = name
    obj.data.materials.append(mat)
    return obj


def sphere(name, radius, location, mat):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=24, ring_count=12, radius=radius, location=location)
    obj = bpy.context.object
    obj.name = name
    obj.data.materials.append(mat)
    bpy.ops.object.shade_smooth()
    return obj


def reset_scene():
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete(use_global=False)
    for datablocks in (bpy.data.meshes, bpy.data.curves, bpy.data.materials, bpy.data.cameras, bpy.data.lights):
        for datablock in list(datablocks):
            if datablock.users == 0:
                datablocks.remove(datablock)


def export(filename):
    os.makedirs(ASSET_DIR, exist_ok=True)
    path = os.path.join(ASSET_DIR, filename)
    bpy.ops.wm.save_as_mainfile(filepath=os.path.join(os.path.dirname(__file__), "last_asset_source.blend"))
    bpy.ops.export_scene.gltf(filepath=path, export_format="GLB", export_apply=True, export_yup=True)
    print(f"EXPORTED {path}")


def build_table():
    reset_scene()
    green = material("Table Green", (0.075, 0.42, 0.29), 0.75)
    dark = material("Table Edge", (0.025, 0.10, 0.065), 0.8)
    white = material("Table Lines", (0.9, 0.88, 0.78), 0.55)
    cube("Tabletop", (4.5, 7.2, 0.14), (0, 0, 0.07), green)
    cube("Table Apron", (4.58, 7.28, 0.16), (0, 0, -0.04), dark)
    cube("Line Long A", (0.035, 7.02, 0.012), (-2.02, 0, 0.148), white)
    cube("Line Long B", (0.035, 7.02, 0.012), (2.02, 0, 0.148), white)
    cube("Line Short A", (4.08, 0.035, 0.012), (0, -3.15, 0.148), white)
    cube("Line Short B", (4.08, 0.035, 0.012), (0, 3.15, 0.148), white)
    cube("Center Line", (0.025, 7.02, 0.012), (0, 0, 0.154), white)
    export("table.glb")


def build_net():
    reset_scene()
    dark = material("Net Frame", (0.025, 0.08, 0.05), 0.8, 0.05)
    mesh = material("Net Mesh", (0.05, 0.12, 0.08), 0.9)
    cube("Net Top", (4.55, 0.075, 0.075), (0, 0, 0.68), dark)
    cube("Net Bottom", (4.55, 0.055, 0.06), (0, 0, 0.08), dark)
    for x in (-2.25, 2.25):
        cube("Net Post", (0.07, 0.10, 0.72), (x, 0, 0.38), dark)
    for index in range(1, 15):
        x = -2.2 + index * (4.4 / 15)
        cube("Net Vertical", (0.012, 0.035, 0.56), (x, 0, 0.38), mesh)
    for index in range(1, 6):
        z = 0.12 + index * 0.10
        cube("Net Horizontal", (4.4, 0.035, 0.012), (0, 0, z), mesh)
    export("net.glb")


def build_paddle(filename, face_color):
    reset_scene()
    face = material("Rubber", face_color, 0.5)
    wood = material("Handle Wood", (0.55, 0.31, 0.13), 0.65)
    grip = material("Handle Grip", (0.18, 0.09, 0.035), 0.8)
    cylinder("Paddle Face", 0.48, 0.12, (0, 0, 0), face, rotation=(1.5708, 0, 0))
    cube("Paddle Neck", (0.18, 0.12, 0.20), (0, 0, 0.45), wood)
    cube("Paddle Handle", (0.16, 0.12, 0.68), (0, 0, 0.83), grip)
    export(filename)


def build_ball():
    reset_scene()
    ball = material("Ball", (0.92, 0.89, 0.76), 0.4)
    sphere("Table Tennis Ball", 0.16, (0, 0, 0), ball)
    export("ball.glb")


if __name__ == "__main__":
    build_table()
    build_net()
    build_paddle("paddle-home.glb", (0.90, 0.14, 0.06))
    build_paddle("paddle-away.glb", (0.025, 0.07, 0.045))
    build_ball()
    print("ASSET_BUILD_COMPLETE")
