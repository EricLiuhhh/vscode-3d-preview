import torch
import numpy as np
import json
from dataclasses import dataclass
from functools import cached_property
from io import BytesIO
from pathlib import Path
from typing import Literal
from PIL import Image
import torch
from torch import Tensor
from einops import rearrange, repeat
from jaxtyping import Float, UInt8

def convert_poses(
    poses: Float[Tensor, "batch 18"],
):
    b, _ = poses.shape

    # Convert the intrinsics to a 3x3 normalized K matrix.
    intrinsics = torch.eye(3, dtype=torch.float32)
    intrinsics = repeat(intrinsics, "h w -> b h w", b=b).clone()
    fx, fy, cx, cy = poses[:, :4].T
    intrinsics[:, 0, 0] = fx
    intrinsics[:, 1, 1] = fy
    intrinsics[:, 0, 2] = cx
    intrinsics[:, 1, 2] = cy

    # Convert the extrinsics to a 4x4 OpenCV-style W2C matrix.
    w2c = repeat(torch.eye(4, dtype=torch.float32), "h w -> b h w", b=b).clone()
    w2c[:, :3] = rearrange(poses[:, 6:], "b (h w) -> b h w", h=3, w=4)
    return w2c.inverse(), intrinsics

def convert_images(
    images,
):
    pil_images = []
    for image in images:
        image = Image.open(BytesIO(image.numpy().tobytes()))
        pil_images.append(image)
    return pil_images

data = torch.load('000000.torch')
example = data[2]

extrinsics, intrinsics = convert_poses(example["cameras"])
images = convert_images(example["images"])
for i, image in enumerate(images):
    image.save(f'cams/{i}.png')
# 将numpy数组转换为列表并存储为JSON文件
data = {
    "intrinsics": intrinsics.tolist(),
    "extrinsics": extrinsics.tolist(),
    "points": np.random.rand(100, 3).tolist(),
    "colors": (np.random.rand(100, 3)*255).tolist(),
}

# 保存为JSON文件
with open('camera_params.campose', 'w') as f:
    json.dump(data, f)