# Small thumbnails are stored inline

Thumbnails for Users, Customers, Suppliers, and Products are optional, square, display-only images intended for compact list and picker surfaces. We store the cropped thumbnail directly on the owning record as a nullable data URL, capped at 256x256 pixels and 64 KB, because this keeps core list queries simple and avoids introducing object storage before full-size media exists. This decision does not apply to future full-size images or document-style media.
