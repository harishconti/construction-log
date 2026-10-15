-- Optional site location / geotag on a project, editable later.
-- Forward-only.

ALTER TABLE "Project" ADD COLUMN "locationName" TEXT;
ALTER TABLE "Project" ADD COLUMN "latitude" DOUBLE PRECISION;
ALTER TABLE "Project" ADD COLUMN "longitude" DOUBLE PRECISION;

-- Coordinates are stored as a pair: both set, or both unset.
ALTER TABLE "Project"
  ADD CONSTRAINT "project_coordinates_pair_check"
  CHECK (("latitude" IS NULL) = ("longitude" IS NULL));
