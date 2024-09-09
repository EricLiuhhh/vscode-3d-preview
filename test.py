import numpy as np

pts = 10 * np.random.rand(100, 3)
colors = 255 * np.ones((100, 3))
pts = np.concatenate([pts, colors], axis=1)
pts.astype(np.float32).tofile('example.bin')