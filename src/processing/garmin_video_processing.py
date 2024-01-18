#!/usr/bin/env python3
import argparse
import cv2
import json
import numpy as np
import os
import sys
import uuid
from typing import Dict, List

#
#   This generates pixel coordinates of the red marker within the g-force graph with respect to time (video frame number)
#   Supply your Garmin Catalyst video files. To ensure compatibility, your video files must not be post-processed in
#   a way that modifies the nature of the video data, such as changing resolution, framerate, color, etc. 
#   Trimming the original source video to a shorter video is OK.
#   
#   Comments:
#       I tried to map the red dots position with the G force magnitude based on pixel location on the video overlay
#       but the distance between the different rings of the g-force graph are different between each ring so it's not a simple linear 
#       deduction of pixel coordinate == gforce value. 
#
#       The 'unit' of the x/y values are in are pixels related to the template image, not the g-force magnitude as recorded by Catalyst. 
#       As a result, these pixel values, which does correspond to the graphs that the Catalyst generates but lack units,
#       is normalized between [-1, 1]. This has no affect on the shape of the graph, but makes viewing the the units on 
#       the x/y axis less strange: imagine values like 151x58, verses some value between -1, 1. 
#       Interpreting the results is more of matter of observing the shape of the curve rather than knowing what 
#       specific G-force magnitude was felt at a giving point in time. 

#       The Garmin Catalyst device/app will tell you the actual value if you really want to know. Though it would be nice to 
#       implement support for the pixel -> g-force conversion.
#
#   Future work:
#       I wanted to read the text present in the video overlay, like speed, time, delta, so I tried using the 
#       OCR library, Tesseract. However it was very inconsistent producing correct output. The font used by Garmin
#       does not seem compatible with Tesseract. An implementation I have in mind would be to use the various .pngs under
#       processing/templates and use opencv to match on shapes within the regions where times are visibile to
#       deduce what the text says.
#

class FrameData:
    def __init__(self, x, y, frame):
        self.x = x
        self.y = y
        self.frame = frame

    def to_dict(self):
        return {
            'x': self.x,
            'y': self.y,
            'z': self.frame
        }

def process_cli_args():
    parser = argparse.ArgumentParser()
    parser.add_argument('-s', '--data_source', type=str, required=True)
    parser.add_argument('-p', '--data_file_path', type=str, required=True)
    parser.add_argument('-t', '--template_path', type=str, help="Supply the path to where the template image is located", required=True)
    parser.add_argument('-o', '--output_path', type=str, help="Supply the path of the OS's, app specific, folder so as to save application generated data locally to the system", required=True)
    args = parser.parse_args()

    sanity_check(args)

    return args


def sanity_check(args):
    if args.data_source != 'garmincatalyst':
        sys.stderr.write(f"Unexpected data_source {args.data_source}. Currently, only `garmincatalyst` is allowed.\n")
        exit(-1)

    if not os.path.exists(args.data_file_path):
        sys.stderr.write(f"The video file specified, {args.data_file_path}, does not exist.\n")
        exit(-1)
    if not args.data_file_path.endswith('.mp4'):
        sys.stderr.write(f"Video file, {args.data_file_path} should be a .mp4 file.\n")
        exit(-1)
    if os.path.getsize(args.data_file_path) == 0:
        sys.stderr.write(f"Video file, {args.data_file_path} is empty.\n")
        exit(-1)

    if not os.path.exists(args.template_path):
        sys.stderr.write(f"The template image file, {args.template_path}, does not exist.\n")
        exit(-1)
    if not args.template_path.endswith('.png'):
        sys.stderr.write(f"Template image file, {args.template_path}, should be a .png.\n")
        exit(-1)
    if os.path.getsize(args.template_path) == 0:
        sys.stderr.write(f"Template image file, {args.template_path}, is empty.\n")
        exit(-1)


def get_video_frame_info(video_path: str) -> dict:
    cap = cv2.VideoCapture(video_path)
    num_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
    fps = cap.get(cv2.CAP_PROP_FPS)
    cap.release()
    return (num_frames, fps)


def process_video(video_path: str, template_path: str) -> List[FrameData]:
    frame_data: List[FrameData] = []
    
    mask_results = generate_gforce_mask(video_path, template_path)
    roi = mask_results['roi']
    mask = mask_results['mask']

    roi_height, roi_width, _ = roi.shape

    # HSV match red color - G-force meter shows a red dot moving based on gforces
    lower_red_1 = np.array([0, 70, 50])
    upper_red_1 = np.array([10, 255, 255])
    lower_red_2 = np.array([170, 70, 50])
    upper_red_2 = np.array([180, 255, 255])

    frame_number = 0
    cap = cv2.VideoCapture(video_path)

    while True:
        ret, frame = cap.read()
        if not ret:
            break

        frame_number += 1
        frame_height, frame_width, _ = frame.shape

        OFFSET = 25
        start_y = frame_height - OFFSET - roi_height
        end_y = frame_height - OFFSET
        start_x = frame_width - OFFSET - roi_width
        end_x = frame_width - OFFSET

        roi = frame[start_y:end_y, start_x:end_x]

        circular_roi = cv2.bitwise_and(roi, roi, mask=mask)

        hsv = cv2.cvtColor(circular_roi, cv2.COLOR_BGR2HSV)
    
        mask1 = cv2.inRange(hsv, lower_red_1, upper_red_1)
        mask2 = cv2.inRange(hsv, lower_red_2, upper_red_2)
        red_mask = mask1 + mask2

        moments = cv2.moments(red_mask)
        if moments['m00'] != 0:
            # FIXME: cX and cY are with respect to the roi's pixel dimension.
            cX = -int(moments['m10'] / moments['m00'])
            cY = int(moments['m01'] / moments['m00'])
            frame_data.append(FrameData(cX, cY, frame_number))
            
    cap.release()
    return frame_data 


def generate_gforce_mask(video_path: str, template_path: str) -> Dict[str, cv2.Mat]:
    template = cv2.imread(template_path, cv2.IMREAD_COLOR)
    roi_height, roi_width, _ = template.shape
    mask = np.zeros((roi_height, roi_width), dtype=np.uint8)
    center = (roi_height // 2, roi_height // 2)
    radius = min(roi_width, roi_height) // 2
    cv2.circle(mask, center, radius, color=255, thickness=-1)

    # Garmin Catalyst video files all have the same static overlay so any frame 
    # from any point in the video will have the same overlay
    cap = cv2.VideoCapture(video_path)
    _, sample_frame = cap.read()
    cap.release()

    sample_height, sample_width, _ = sample_frame.shape

    # offset number determined by visually inspecting the frame via cv2.imshow()
    OFFSET = 25
    start_y = sample_height - OFFSET - roi_height
    end_y = sample_height - OFFSET
    start_x = sample_width - OFFSET - roi_width
    end_x = sample_width - OFFSET

    roi_frame = sample_frame[start_y : end_y, start_x : end_x]
    roi = cv2.bitwise_and(roi_frame, roi_frame, mask=mask)

    return {'roi': roi, 'mask': mask}


def jsonify_results(num_frames, fps, frame_data):
    json_results = []
    for frame in frame_data:
        json_results.append(frame.to_dict())

    processing_response = {
        'data': {
            'num_frames': num_frames,
            'fps': fps,
            'trace': json_results,
        },
    }

    return json.dumps(processing_response)

if __name__ == "__main__":
    args = process_cli_args()

    num_frames, fps = get_video_frame_info(args.data_file_path)
    frame_data = process_video(args.data_file_path, args.template_path)
    json_output = jsonify_results(num_frames, fps, frame_data) 

    generated_uuid = str(uuid.uuid4())
    file_path = f"{args.output_path}/video_{generated_uuid}.json"
    
    with open(file_path, 'w') as f:
        f.writelines(json_output)

    print(f"{file_path}")