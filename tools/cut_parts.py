"""Cut the full film into 4 one-minute episodes (no re-render)."""
import subprocess, os
SRC = "output/30_Days_Floor_25.mp4"
FONT = "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"
PARTS = {
    1: [(0, 10), (15.5, 18.5), (24.5, 34), (50, 62), (63.5, 67), (86, 99.6), (111.5, 121)],
    2: [(130, 136), (143, 155), (157.5, 161), (164.5, 173), (181.5, 185), (195.5, 199), (203.5, 215), (216.5, 224)],
    3: [(230, 242), (255.5, 259), (264.5, 275), (281.5, 297), (300, 303), (321.5, 330), (336.5, 340)],
    4: [(352.5, 364), (373.5, 379), (396.5, 400), (408.5, 418), (422.5, 432), (451.5, 468), (470, 476)],
}
for n, segs in PARTS.items():
    f, labels = [], []
    for i, (a, b) in enumerate(segs):
        f.append(f"[0:v]trim={a}:{b},setpts=PTS-STARTPTS[v{i}]")
        f.append(f"[0:a]atrim={a}:{b},asetpts=PTS-STARTPTS,afade=t=in:d=0.06,afade=t=out:st={b-a-0.08:.2f}:d=0.08[a{i}]")
        labels.append(f"[v{i}][a{i}]")
    total = sum(b - a for a, b in segs)
    dt = (f"drawtext=fontfile={FONT}:text='TEIL {n}/4':fontsize=86:fontcolor=white:borderw=8:bordercolor=black:"
          f"x=(w-tw)/2:y=h*0.42:enable='between(t,0.3,2.8)'")
    if n < 4:
        dt += (f",drawtext=fontfile={FONT}:text='FORTSETZUNG FOLGT ...':fontsize=64:fontcolor=0xffd23f:borderw=7:bordercolor=black:"
               f"x=(w-tw)/2:y=h*0.45:enable='gte(t,{total-2.2:.2f})'")
    f.append("".join(labels) + f"concat=n={len(segs)}:v=1:a=1[cv][ca]")
    f.append(f"[cv]{dt}[outv]")
    out = f"output/30_Days_Teil_{n}.mp4"
    subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-i", SRC, "-filter_complex", ";".join(f), "-map", "[outv]", "-map", "[ca]",
                    "-c:v", "libx264", "-preset", "medium", "-crf", "21", "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "160k", "-movflags", "+faststart", out], check=True)
    print(out, round(total, 1), "s")
