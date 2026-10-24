# ADERVIS в 3D: объёмный золотой знак с фаской, неоновые диагонали, дым,
# красный и фиолетовый свет — аватар (1000×1000) и шапка ВКонтакте (1920×768).
# Контуры берутся из brand/icon.svg и brand/logo.svg — один в один с логотипом.
# Запуск: blender -b -P tools/brand3d/adervis3d.py -- <папка intel> avatar|cover [сэмплы]
import bpy, math, os, sys, addon_utils
from mathutils import Vector

args = sys.argv[sys.argv.index('--') + 1:]
ROOT, SHOT = args[0], args[1]
SAMPLES = int(args[2]) if len(args) > 2 else 256
OUT = os.path.join(ROOT, 'brand', 'social', '3d')
os.makedirs(OUT, exist_ok=True)


def lin(h):
    c = [int(h[i:i + 2], 16) / 255 for i in (1, 3, 5)]
    return tuple(v / 12.92 if v <= 0.04045 else ((v + 0.055) / 1.055) ** 2.4 for v in c)


GOLD, RED, VIOLET, WHITE = lin('#f6bd3a'), lin('#ff2b3d'), lin('#6a3cff'), (1, 1, 1)

bpy.ops.wm.read_factory_settings(use_empty=True)
addon_utils.enable('io_curve_svg', default_set=True)
sc = bpy.context.scene
sc.render.engine = 'CYCLES'
prefs = bpy.context.preferences.addons['cycles'].preferences
prefs.compute_device_type = 'OPTIX'; prefs.get_devices()
for d in prefs.devices: d.use = True
sc.cycles.device = 'GPU'; sc.cycles.samples = SAMPLES; sc.cycles.use_denoising = True
sc.cycles.volume_step_rate = 2; sc.cycles.max_bounces = 8
sc.view_settings.view_transform = 'AgX'; sc.view_settings.look = 'AgX - Medium High Contrast'
W, H = (1000, 1000) if SHOT == 'avatar' else (1920, 768)
sc.render.resolution_x, sc.render.resolution_y = W, H

world = bpy.data.worlds.new('мир'); sc.world = world; world.use_nodes = True
world.node_tree.nodes['Background'].inputs['Color'].default_value = (*lin('#0b0b0e'), 1)
world.node_tree.nodes['Background'].inputs['Strength'].default_value = 1


def mat(name, color, metal=0.0, rough=0.5, emit=None, strength=0.0, coat=0.0):
    m = bpy.data.materials.new(name); m.use_nodes = True
    b = m.node_tree.nodes['Principled BSDF']
    b.inputs['Base Color'].default_value = (*color, 1); b.inputs['Metallic'].default_value = metal
    b.inputs['Roughness'].default_value = rough; b.inputs['Coat Weight'].default_value = coat
    if emit:
        b.inputs['Emission Color'].default_value = (*emit, 1); b.inputs['Emission Strength'].default_value = strength
    return m


def import_svg(path):
    before = set(bpy.data.objects)
    bpy.ops.import_curve.svg(filepath=path)
    return [o for o in bpy.data.objects if o not in before and o.type == 'CURVE']


def is_gold(o):
    m = o.data.materials[0] if o.data.materials else None
    c = m.diffuse_color if m else (1, 1, 1, 1)
    return c[0] > 0.5 and c[2] < 0.35


def normalize(objs, height):
    """Общая рамка объектов → центр в нуле, высота height."""
    pts = [o.matrix_world @ Vector(v) for o in objs for v in o.bound_box]
    lo = Vector((min(p.x for p in pts), min(p.y for p in pts), 0)); hi = Vector((max(p.x for p in pts), max(p.y for p in pts), 0))
    k = height / (hi.y - lo.y); c = (lo + hi) / 2
    for o in objs:
        o.location = (o.location - c) * k; o.scale = o.scale * k
    return (hi.x - lo.x) * k


def solid(objs, name, m, depth, bevel):
    """Кривые → меш с толщиной и скруглённой фаской."""
    bpy.ops.object.select_all(action='DESELECT')
    for o in objs: o.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]
    bpy.ops.object.convert(target='MESH')
    if len(objs) > 1: bpy.ops.object.join()
    o = bpy.context.view_layer.objects.active; o.name = name
    bpy.ops.object.transform_apply(location=False, rotation=True, scale=True)
    o.data.materials.clear(); o.data.materials.append(m)
    s = o.modifiers.new('толщина', 'SOLIDIFY'); s.thickness = depth; s.offset = 0
    bv = o.modifiers.new('фаска', 'BEVEL'); bv.width = bevel; bv.segments = 5; bv.limit_method = 'ANGLE'; bv.angle_limit = math.radians(40)
    bpy.ops.object.shade_smooth()
    if hasattr(o.data, 'use_auto_smooth'): o.data.use_auto_smooth = True
    o.modifiers.new('нормали', 'WEIGHTED_NORMAL')
    return o


gold = mat('золото', GOLD, metal=1.0, rough=0.24, coat=0.4, emit=GOLD, strength=0.35)
silver = mat('надпись', (0.92, 0.92, 0.94), metal=0.6, rough=0.3)
rig = bpy.data.objects.new('знак', None); sc.collection.objects.link(rig)

if SHOT == 'avatar':
    curves = import_svg(os.path.join(ROOT, 'brand', 'icon.svg'))
    normalize(curves, 4.5)
    mark = solid(curves, 'знак', gold, 0.42, 0.06)
    mark.parent = rig
else:
    curves = import_svg(os.path.join(ROOT, 'brand', 'logo.svg'))
    width = normalize(curves, 0.62)
    # цвета из CSS-классов импорт SVG не читает: знак — самый левый контур логотипа
    cx = lambda o: sum((o.matrix_world @ Vector(v)).x for v in o.bound_box) / 8
    g = [min(curves, key=cx)]; t = [o for o in curves if o not in g]
    mark = solid(g, 'знак', gold, 0.1, 0.014); mark.parent = rig
    word = solid(t, 'надпись', silver, 0.06, 0.007); word.parent = rig
    rig.location = (0, 0.22, 0)

# лёгкий разворот — видно толщину и фаску
rig.rotation_euler = (math.radians(6), math.radians(-8), 0) if SHOT == 'avatar' else (math.radians(8), math.radians(-10), 0)

# контуры знака позади — тонкие светящиеся линии, как в 2D-версии
ring = mat('контур', (0, 0, 0), rough=1.0, emit=(0.85, 0.82, 0.95), strength=0.5 if SHOT == 'avatar' else 0.045)
for k, z in ((1.42, -2.2),) if SHOT == 'avatar' else ((1.5, -2.0),):
    c = import_svg(os.path.join(ROOT, 'brand', 'icon.svg'))
    normalize(c, 4.5 * k if SHOT == 'avatar' else 1.6 * k)
    for o in c:
        o.data.fill_mode = 'NONE'; o.data.bevel_depth = 0.006 / max(o.scale.x, 1e-6)
        o.data.materials.clear(); o.data.materials.append(ring)
        o.location.z = z
        o.location.y -= 0.9 if SHOT == 'avatar' else 0.15
        # только внешний контур: оставляем сплайн с самой большой рамкой
        if len(o.data.splines) > 1:
            size = lambda sp: (lambda xs, ys: (max(xs) - min(xs)) * (max(ys) - min(ys)))([p.co.x for p in sp.bezier_points] or [0], [p.co.y for p in sp.bezier_points] or [0])
            keep = max(o.data.splines, key=size)
            for sp in [x for x in o.data.splines if x != keep]: o.data.splines.remove(sp)

# неоновые диагонали у краёв: слева розовато-белые, справа фиолетово-белые
span = 9 if SHOT == 'avatar' else 14
for side, tint in ((-1, (1.0, 0.72, 0.78)), (1, (0.82, 0.74, 1.0))):
    lm = mat('диагональ', WHITE, emit=tint, strength=5)
    for i in range(4 if SHOT == 'avatar' else 7):
        bpy.ops.mesh.primitive_cube_add(size=1)
        l = bpy.context.active_object; l.scale = (0.016, 14, 0.016)
        l.location = (side * ((3.3 + i * 0.62) if SHOT == 'avatar' else (3.5 + i * 0.62)), 0, -3.4)
        l.rotation_euler = (0, 0, side * math.radians(26))
        l.data.materials.append(lm)

# дым: цветные облака в углах — красное слева сверху, фиолетовое справа снизу; центр тёмный
def smoke(name, loc, size, color, strength):
    bpy.ops.mesh.primitive_uv_sphere_add(radius=1, location=loc, segments=48, ring_count=24)
    o = bpy.context.active_object; o.scale = size; o.name = name
    m = bpy.data.materials.new(name); m.use_nodes = True; nt = m.node_tree
    nt.nodes.remove(nt.nodes['Principled BSDF'])
    vol = nt.nodes.new('ShaderNodeVolumePrincipled'); noise = nt.nodes.new('ShaderNodeTexNoise'); ramp = nt.nodes.new('ShaderNodeValToRGB')
    grad = nt.nodes.new('ShaderNodeTexGradient'); grad.gradient_type = 'SPHERICAL'; mul = nt.nodes.new('ShaderNodeMath'); mul.operation = 'MULTIPLY'
    tc = nt.nodes.new('ShaderNodeTexCoord')   # координаты объекта: центр облака — в его центре, края тают
    nt.links.new(tc.outputs['Object'], grad.inputs['Vector']); nt.links.new(tc.outputs['Object'], noise.inputs['Vector'])
    soft = nt.nodes.new('ShaderNodeMath'); soft.operation = 'POWER'; soft.inputs[1].default_value = 2.2
    nt.links.new(grad.outputs['Fac'], soft.inputs[0])
    noise.inputs['Scale'].default_value = 2.6; noise.inputs['Detail'].default_value = 12; noise.inputs['Roughness'].default_value = 0.68; noise.inputs['Distortion'].default_value = 0.8
    ramp.color_ramp.elements[0].position = 0.46; ramp.color_ramp.elements[0].color = (0, 0, 0, 1)
    ramp.color_ramp.elements[1].position = 0.74; ramp.color_ramp.elements[1].color = (0.6, 0.6, 0.6, 1)
    nt.links.new(noise.outputs['Fac'], ramp.inputs['Fac'])
    nt.links.new(ramp.outputs['Color'], mul.inputs[0]); nt.links.new(soft.outputs['Value'], mul.inputs[1])   # к краю облака плотность тает
    nt.links.new(mul.outputs['Value'], vol.inputs['Density'])
    vol.inputs['Color'].default_value = (*color, 1)
    vol.inputs['Emission Color'].default_value = (*color, 1); vol.inputs['Emission Strength'].default_value = strength
    nt.links.new(mul.outputs['Value'], vol.inputs['Emission Strength'])
    nt.links.new(vol.outputs['Volume'], nt.nodes['Material Output'].inputs['Volume'])
    o.data.materials.append(m)


if SHOT == 'avatar':
    smoke('красный дым', (-4.6, 1.4, -3.2), (3.6, 5.2, 1.8), RED, 3.0)
    smoke('фиолетовый дым', (4.6, -1.2, -3.2), (3.6, 5.2, 1.8), VIOLET, 3.0)
else:
    smoke('красный дым', (-4.9, 0.5, -3.2), (3.8, 3.4, 1.8), RED, 3.6)
    smoke('фиолетовый дым', (4.9, -0.4, -3.2), (3.8, 3.4, 1.8), VIOLET, 3.6)


def area(name, loc, target, size, power, color):
    ld = bpy.data.lights.new(name, 'AREA'); ld.size = size; ld.energy = power; ld.color = color
    o = bpy.data.objects.new(name, ld); sc.collection.objects.link(o); o.location = loc
    o.rotation_euler = (Vector(target) - Vector(loc)).to_track_quat('-Z', 'Y').to_euler()


w = 1.0 if SHOT == 'avatar' else 1.7
# цвет — на дым позади и скользящим светом по рёбрам знака
area('красный дым', (-6.5 * w, 1.5, -1.2), (-1.5 * w, 0, -3.4), 4.0, 3200, RED)
area('фиолетовый дым', (6.5 * w, -1.0, -1.2), (1.5 * w, 0, -3.4), 4.0, 3200, VIOLET)
area('красный кант', (-3.6 * w, 0.4, 0.5), (0, 0, 0), 1.2, 260, RED)
area('фиолетовый кант', (3.6 * w, -0.4, 0.5), (0, 0, 0), 1.2, 260, VIOLET)
area('ключ', (1.2, 3.0, 7.0), (0, 0, 0), 4.0, 500, (1.0, 0.9, 0.75))
# большой тёплый софтбокс за камерой — золото отражает его и остаётся золотом
soft = mat('софтбокс', (1, 1, 1), emit=(1.0, 0.86, 0.62), strength=1.4)
bpy.ops.mesh.primitive_plane_add(size=1, location=(0, 1.5, 16)); sb = bpy.context.active_object
sb.scale = (22, 12, 1); sb.rotation_euler = (math.radians(180), 0, 0); sb.data.materials.append(soft)
sb.visible_camera = False

cam_d = bpy.data.cameras.new('камера'); cam_d.lens = 70 if SHOT == 'avatar' else 50
cam = bpy.data.objects.new('камера', cam_d); sc.collection.objects.link(cam); sc.camera = cam
cam.location = (0, 0, 13.5 if SHOT == 'avatar' else 9.0); cam.rotation_euler = (0, 0, 0)
cam_d.dof.use_dof = True; cam_d.dof.focus_distance = cam.location.z; cam_d.dof.aperture_fstop = 5.6

# свечение неона и бликов
sc.use_nodes = True; ct = sc.node_tree
rl, comp = ct.nodes['Render Layers'], ct.nodes['Composite']
glare = ct.nodes.new('CompositorNodeGlare'); glare.glare_type = 'FOG_GLOW'; glare.quality = 'HIGH'; glare.threshold = 0.55; glare.size = 9; glare.mix = -0.35
ct.links.new(rl.outputs['Image'], glare.inputs['Image']); ct.links.new(glare.outputs['Image'], comp.inputs['Image'])

sc.render.filepath = os.path.join(OUT, f'adervis-3d-{SHOT}.png')
bpy.ops.render.render(write_still=True)
bpy.ops.wm.save_as_mainfile(filepath=os.path.join(OUT, f'adervis-3d-{SHOT}.blend'))
print('RENDERED', SHOT)
