"use client";

import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import type { AvatarRecipe, Joker, ParkEvent } from "@/lib/api";

const defaultRecipe: AvatarRecipe = {
  art_version: "native-clown-v1",
  palette: { primary: "#27f5d4", secondary: "#ff5f8f", accent: "#ffe45e" },
  head_scale: 1,
  body_scale: 1,
  eye_spacing: 0.5,
  eye_size: 0.5,
  nose_scale: 0.5,
  cheek_scale: 0.5,
  mouth_width: 0.5,
  hat_height: 0.5,
  hat_tilt: 0.5,
  motion_style: "gentle-float",
  material: "soft-vinyl"
};

function clamp01(value: number | undefined, fallback = 0.5) {
  if (typeof value !== "number" || Number.isNaN(value)) return fallback;
  return Math.max(0, Math.min(1, value));
}

function recipeWithPalette(recipe: AvatarRecipe | null | undefined, palette?: AvatarRecipe["palette"]): AvatarRecipe {
  return {
    ...defaultRecipe,
    ...(recipe ?? {}),
    palette: palette ?? recipe?.palette ?? defaultRecipe.palette
  };
}

function makeClown(recipe: AvatarRecipe, color: string, accent: string) {
  const group = new THREE.Group();
  const headScale = Math.max(0.82, Math.min(1.24, recipe.head_scale || 1));
  const bodyScale = Math.max(0.86, Math.min(1.16, recipe.body_scale || 1));
  const eyeSpacing = 0.15 + clamp01(recipe.eye_spacing) * 0.09;
  const eyeSize = 0.035 + clamp01(recipe.eye_size) * 0.045;
  const cheekSize = 0.06 + clamp01(recipe.cheek_scale) * 0.055;
  const noseSize = 0.055 + clamp01(recipe.nose_scale) * 0.065;
  const mouthWidth = 0.12 + clamp01(recipe.mouth_width) * 0.18;
  const hatHeight = 0.42 + clamp01(recipe.hat_height) * 0.34;
  const hatTilt = (clamp01(recipe.hat_tilt) - 0.5) * 0.42;

  const vinyl = new THREE.MeshStandardMaterial({
    color: "#fff8e7",
    roughness: 0.72,
    metalness: 0.04
  });
  const suit = new THREE.MeshStandardMaterial({
    color,
    roughness: 0.62,
    metalness: 0.08
  });
  const cheek = new THREE.MeshStandardMaterial({
    color: "#ff5f8f",
    roughness: 0.8
  });
  const hat = new THREE.MeshStandardMaterial({
    color: accent,
    roughness: 0.58,
    emissive: new THREE.Color(accent).multiplyScalar(0.18)
  });

  const head = new THREE.Mesh(new THREE.SphereGeometry(0.42, 32, 32), vinyl);
  head.position.set(0, 1.55, 0);
  head.scale.set(0.92 + headScale * 0.08, headScale, 0.95 + headScale * 0.05);
  group.add(head);

  const eyeMaterial = new THREE.MeshStandardMaterial({ color: "#171222", roughness: 0.58 });
  for (const x of [-eyeSpacing, eyeSpacing]) {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(eyeSize, 16, 16), eyeMaterial);
    eye.position.set(x, 1.65, 0.38);
    group.add(eye);
  }

  for (const x of [-0.2, 0.2]) {
    const face = new THREE.Mesh(new THREE.SphereGeometry(cheekSize, 16, 16), cheek);
    face.position.set(x, 1.54, 0.37);
    group.add(face);
  }

  const nose = new THREE.Mesh(new THREE.SphereGeometry(noseSize, 16, 16), new THREE.MeshStandardMaterial({ color: "#ff3d5d" }));
  nose.position.set(0, 1.45, 0.4);
  group.add(nose);

  const smile = new THREE.Mesh(
    new THREE.TorusGeometry(mouthWidth, 0.012, 8, 36, Math.PI),
    new THREE.MeshStandardMaterial({ color: "#27152d", roughness: 0.72 })
  );
  smile.position.set(0, 1.36, 0.39);
  smile.rotation.set(0, 0, Math.PI);
  group.add(smile);

  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.3, 0.52, 12, 24), suit);
  body.position.set(0, 0.88, 0);
  body.scale.set(0.96 + bodyScale * 0.04, bodyScale, 0.96 + bodyScale * 0.04);
  group.add(body);

  const cone = new THREE.Mesh(new THREE.ConeGeometry(0.28, hatHeight, 32), hat);
  cone.position.set(0, 1.84 + hatHeight * 0.45, 0);
  cone.rotation.z = hatTilt;
  group.add(cone);

  for (const [x, legColor] of [
    [-0.18, "#ffe45e"],
    [0.18, "#27f5d4"]
  ] as const) {
    const leg = new THREE.Mesh(new THREE.CapsuleGeometry(0.09, 0.38, 8, 16), new THREE.MeshStandardMaterial({ color: legColor }));
    leg.position.set(x, 0.24, 0);
    group.add(leg);
  }

  return group;
}

function makeBalloon(color: string, index: number) {
  const balloon = new THREE.Mesh(
    new THREE.SphereGeometry(0.18, 24, 24),
    new THREE.MeshStandardMaterial({
      color,
      roughness: 0.5,
      emissive: new THREE.Color(color).multiplyScalar(0.12)
    })
  );
  balloon.position.set(-3.2 + index * 0.7, 2.2 + Math.sin(index) * 0.28, -1.4);
  return balloon;
}

export function ParkScene({ joker, events }: { joker: Joker | null; events: ParkEvent[] }) {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const active = events[events.length - 1];
  const palette = joker?.style_tokens.palette;
  const avatarRecipe = useMemo(
    () => recipeWithPalette(joker?.avatar_recipe, joker?.avatar_recipe?.palette ?? palette),
    [joker?.avatar_recipe, palette]
  );
  const colors = useMemo(
    () => [
      palette?.primary ?? "#27f5d4",
      palette?.secondary ?? "#ff5f8f",
      palette?.accent ?? "#ffe45e",
      "#8b5cf6",
      "#42e8f5"
    ],
    [palette?.accent, palette?.primary, palette?.secondary]
  );

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    mount.replaceChildren();

    const scene = new THREE.Scene();
    scene.background = new THREE.Color("#100d24");
    scene.fog = new THREE.Fog("#100d24", 7, 14);

    const camera = new THREE.PerspectiveCamera(48, 1, 0.1, 100);
    camera.position.set(0, 3.2, 6.5);
    camera.lookAt(0, 1.1, 0);

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    mount.appendChild(renderer.domElement);

    scene.add(new THREE.AmbientLight("#fff8e7", 0.75));

    const key = new THREE.DirectionalLight("#fff8e7", 1.6);
    key.position.set(2, 6, 4);
    key.castShadow = true;
    scene.add(key);

    const coral = new THREE.PointLight("#ff5f8f", 1.2, 10);
    coral.position.set(-3, 2, 2);
    scene.add(coral);

    const cyan = new THREE.PointLight("#27f5d4", 1.1, 10);
    cyan.position.set(3, 2, -1);
    scene.add(cyan);

    const floor = new THREE.Mesh(
      new THREE.CircleGeometry(5.2, 96),
      new THREE.MeshStandardMaterial({ color: "#1b1735", roughness: 0.8 })
    );
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    scene.add(floor);

    const ring = new THREE.Mesh(
      new THREE.RingGeometry(2.4, 2.52, 96),
      new THREE.MeshStandardMaterial({
        color: "#27f5d4",
        emissive: "#0b3f37",
        emissiveIntensity: 0.4
      })
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.01;
    scene.add(ring);

    const clowns = colors.map((color, index) => {
      const recipe = index === 0 ? avatarRecipe : recipeWithPalette(null, { primary: color, secondary: "#ff5f8f", accent: index % 2 === 0 ? "#ffe45e" : "#27f5d4" });
      const clown = makeClown(recipe, color, recipe.palette.accent);
      clown.position.set((index - 2) * 1.45, 0, (index % 2) * 0.65 - 0.4);
      scene.add(clown);
      return clown;
    });

    const balloonCount = Math.max(4, Math.min(events.length + 4, 10));
    const balloonColors = ["#ff5f8f", "#27f5d4", "#ffe45e"];
    for (let index = 0; index < balloonCount; index += 1) {
      scene.add(makeBalloon(balloonColors[index % balloonColors.length], index));
    }

    const resize = () => {
      const { clientWidth, clientHeight } = mount;
      renderer.setSize(clientWidth, clientHeight, false);
      camera.aspect = clientWidth / Math.max(clientHeight, 1);
      camera.updateProjectionMatrix();
    };

    const observer = new ResizeObserver(resize);
    observer.observe(mount);
    resize();

    let frame = 0;
    const animate = () => {
      const time = performance.now() / 1000;
      clowns.forEach((clown, index) => {
        const isActive = Boolean(active && index === events.length % clowns.length);
        const bounce = avatarRecipe.motion_style === "spring-bounce" && index === 0 ? 2.1 : 1.6;
        clown.position.y = Math.sin(time * bounce + index * 0.7) * (isActive ? 0.16 : 0.08);
        clown.rotation.y = Math.sin(time + index) * 0.18;
      });
      ring.rotation.z = time * 0.08;
      renderer.render(scene, camera);
      frame = window.requestAnimationFrame(animate);
    };
    animate();

    return () => {
      window.cancelAnimationFrame(frame);
      observer.disconnect();
      renderer.dispose();
      scene.traverse((object) => {
        if (object instanceof THREE.Mesh) {
          object.geometry.dispose();
          const materials = Array.isArray(object.material) ? object.material : [object.material];
          materials.forEach((material) => material.dispose());
        }
      });
      mount.replaceChildren();
    };
  }, [active, avatarRecipe, colors, events.length]);

  return (
    <div className="park-panel">
      <div className="park-canvas scene-stage">
        <div ref={mountRef} className="scene-mount" aria-label="3D 小丑乐园实时舞台" />
        <div className="scene-caption">
          {active?.dialogue ?? "小丑乐园正在待命，等一颗情绪气球起飞。"}
        </div>
      </div>
      <div className="event-list" aria-label="乐园事件流">
        {events.length === 0 ? (
          <div className="event-row">
            <strong>等待第一场社交替身秀</strong>
            <span className="event-meta">创建小丑或提交治愈动作后，这里会出现可回放事件。</span>
          </div>
        ) : (
          events.slice(-6).reverse().map((event) => (
            <div className="event-row" key={event.id}>
              <strong>{event.source === "autonomy" ? "自主小丑" : "现场动作"} · {event.animation_clip}</strong>
              <span>{event.dialogue}</span>
              <span className="event-meta">mood +{event.mood_delta} · {new Date(event.created_at).toLocaleTimeString()}</span>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
